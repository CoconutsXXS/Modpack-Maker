// mergeOptimized_robust.js
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

// Patch raycast if acceleratedRaycast present
if (acceleratedRaycast) {
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

// invisible material for raycast mesh
const raycastMaterial = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });

/* -------------------------
   Helpers: collect & build
   ------------------------- */

function collectSources(root, materialList = [], materialIndexMap = new Map()) {
  root.updateMatrixWorld(true);
  const sources = [];

  function getMatIndex(mat) {
    if (materialIndexMap.has(mat)) return materialIndexMap.get(mat);
    const idx = materialList.length;
    materialList.push(mat);
    materialIndexMap.set(mat, idx);
    return idx;
  }

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geom = obj.geometry.clone();
    geom.applyMatrix4(obj.matrixWorld);

    // ensure index exists & is Uint32
    if (!geom.index) {
      const posCount = geom.attributes.position.count;
      const idx = new Uint32Array(posCount);
      for (let i = 0; i < posCount; i++) idx[i] = i;
      geom.setIndex(new THREE.BufferAttribute(idx, 1));
    } else {
      const ia = geom.index.array;
      if (!(ia instanceof Uint32Array)) {
        geom.setIndex(new THREE.BufferAttribute(new Uint32Array(Array.from(ia)), 1));
      }
    }

    geom.computeBoundingBox();
    const bbox = geom.boundingBox ? geom.boundingBox.clone() : null;

    const matIndex = getMatIndex(obj.material);
    sources.push({ geom, materialIndex: matIndex, bbox, srcMesh: obj });
  });

  return { sources, materialList };
}

/**
 * Build one merged geometry used exclusively for raycasting.
 * Returns { merged, triToSrc }
 */
function buildMergedRayGeometry(sources) {
  const posAcc = [];
  const normalAcc = [];
  const uvAcc = [];
  const idxAcc = [];
  const triToSrc = [];

  let vertexOffset = 0;
  for (let s = 0; s < sources.length; s++) {
    const geom = sources[s].geom;
    const pAttr = geom.attributes.position;
    const nAttr = geom.attributes.normal;
    const uvAttr = geom.attributes.uv;
    const iArr = geom.index.array;

    // positions
    const pArr = pAttr.array;
    for (let i = 0; i < pArr.length; i++) posAcc.push(pArr[i]);

    // normals (or zeros)
    if (nAttr) {
      const nArr = nAttr.array;
      for (let i = 0; i < nArr.length; i++) normalAcc.push(nArr[i]);
    } else {
      for (let i = 0; i < pAttr.count * 3; i++) normalAcc.push(0);
    }

    // uvs (or zeros)
    if (uvAttr) {
      const ua = uvAttr.array;
      for (let i = 0; i < ua.length; i++) uvAcc.push(ua[i]);
    } else {
      for (let i = 0; i < pAttr.count * 2; i++) uvAcc.push(0);
    }

    // indices and tri->src mapping
    for (let k = 0; k < iArr.length; k += 3) {
      idxAcc.push(iArr[k] + vertexOffset, iArr[k + 1] + vertexOffset, iArr[k + 2] + vertexOffset);
      triToSrc.push(s);
    }

    vertexOffset += pAttr.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(posAcc), 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(normalAcc), 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(uvAcc), 2));
  merged.setIndex(new THREE.BufferAttribute(new Uint32Array(idxAcc), 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  return { merged, triToSrc: new Uint32Array(triToSrc) };
}

/* -------------------------
   Core processing
   ------------------------- */

/**
 * Default axis directions used for robust ray tests.
 * You can override by passing options.rayDirections (array of THREE.Vector3)
 */
const DEFAULT_RAY_DIRS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1)
];

/**
 * Counts intersections with mergedRayMesh from a sample point along a direction,
 * ignoring triangles coming from same sourceIndex. Skips hits that are extremely close.
 *
 * Returns the parity boolean: true if insideOther (odd intersections), false if exposed (even).
 */
function parityTest(mergedRayMesh, triToSrc, samplePoint, dir, sourceIndex, raycaster, minHitDistance) {
  raycaster.set(samplePoint, dir);
  const hits = raycaster.intersectObject(mergedRayMesh, true);
  let intersections = 0;
  for (let h = 0; h < hits.length; h++) {
    const hit = hits[h];
    // small-distance hits are likely self hits; ignore them
    if (hit.distance !== undefined && hit.distance < minHitDistance) continue;
    const faceIndex = hit.faceIndex;
    if (faceIndex === undefined || faceIndex === null) continue;
    const hitSrc = triToSrc[faceIndex];
    if (hitSrc === sourceIndex) continue;
    intersections++;
  }
  return (intersections % 2) === 1;
}

/**
 * The processing loop (shared by sync & chunked) but parameterized for chunking via `yieldFn`.
 *
 * yieldFn(processed) should either do nothing (sync) or await a tick and call onProgress.
 */
async function processTrianglesGeneric(sources, mergedRayMesh, triToSrc, materialList, options = {}, yieldFn = null) {
  const {
    sampleEpsilon = 1e-4,
    minTriArea = 0,
    skipIfOutsideBbox = true,
    weldTolerance = 1e-5,
    rayDirections = DEFAULT_RAY_DIRS,
    minHitDistance = 1e-6,
    tryBothSides = true // fallback attempt along -normal if +normal parity ambiguous
  } = options;

  // per-material buckets
  const perMat = materialList.map(() => ({ positions: [], normals: [], uvs: [], indices: [], vertexCount: 0 }));

  // prepare merged geometry for raycasts
  if (typeof MeshBVH !== 'undefined' && mergedRayMesh.geometry && !mergedRayMesh.geometry.boundsTree) {
    mergedRayMesh.geometry.boundsTree = new MeshBVH(mergedRayMesh.geometry, { lazyGeneration: false });
  }
  mergedRayMesh.frustumCulled = false;

  // raycaster
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false;

  // precompute source bboxes for quick skip
  const rayBBoxes = sources.map(s => (s.geom && s.geom.boundingBox) ? s.geom.boundingBox.clone() : null);

  // temporaries
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), triNormal = new THREE.Vector3();
  const centroid = new THREE.Vector3(), samplePoint = new THREE.Vector3();

  // inline push (no new allocations)
  function pushTriangle(bucket, ax, ay, az, bx, by, bz, cx, cy, cz, nAx, nAy, nAz, nBx, nBy, nBz, nCx, nCy, nCz, uAx, uAy, uBx, uBy, uCx, uCy) {
    const base = bucket.vertexCount;
    bucket.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    bucket.normals.push(nAx, nAy, nAz, nBx, nBy, nBz, nCx, nCy, nCz);
    bucket.uvs.push(uAx, uAy, uBx, uBy, uCx, uCy);
    bucket.indices.push(base, base + 1, base + 2);
    bucket.vertexCount += 3;
  }

  // iterate sources & triangles
  let processed = 0;
  for (let s = 0; s < sources.length; s++) {
    const { geom, materialIndex } = sources[s];
    const posAttr = geom.attributes.position;
    const normAttr = geom.attributes.normal;
    const uvAttr = geom.attributes.uv;
    const idx = geom.index.array;
    const posArr = posAttr.array;
    const nArr = normAttr ? normAttr.array : null;
    const uvArr = uvAttr ? uvAttr.array : null;

    for (let ti = 0; ti < idx.length; ti += 3) {
      const i0 = idx[ti], i1 = idx[ti + 1], i2 = idx[ti + 2];

      a.set(posArr[i0 * 3], posArr[i0 * 3 + 1], posArr[i0 * 3 + 2]);
      b.set(posArr[i1 * 3], posArr[i1 * 3 + 1], posArr[i1 * 3 + 2]);
      c.set(posArr[i2 * 3], posArr[i2 * 3 + 1], posArr[i2 * 3 + 2]);

      // area check
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      triNormal.crossVectors(ab, ac);
      const area2 = triNormal.length();
      if (area2 <= minTriArea) {
        processed++;
        if (yieldFn && (processed % (options.batchSize || 2000) === 0)) await yieldFn(processed);
        continue;
      }
      triNormal.normalize();

      // centroid & sample point
      centroid.set(0, 0, 0).add(a).add(b).add(c).multiplyScalar(1 / 3);

      // We'll treat triangle as exposed unless all direction tests say internal
      let classifiedInternalInAllDirs = true;

      // Try multiple ray directions — if any says exposed we keep triangle
      for (let rd = 0; rd < rayDirections.length; rd++) {
        const dir = rayDirections[rd];

        // sample on +normal side
        samplePoint.copy(centroid).addScaledVector(triNormal, sampleEpsilon);

        // Quick bbox skip: if sample point outside *all* other bboxes then it's exposed
        if (skipIfOutsideBbox) {
          let insideAnyBbox = false;
          for (let j = 0; j < rayBBoxes.length; j++) {
            if (j === s) continue;
            const bb = rayBBoxes[j];
            if (!bb) { insideAnyBbox = true; break; }
            if (bb.containsPoint(samplePoint)) { insideAnyBbox = true; break; }
          }
          if (!insideAnyBbox) {
            // exposed for this direction — accept triangle immediately
            classifiedInternalInAllDirs = false;
            break;
          }
        }

        // perform parity test from +normal side
        let insideOther;
        try {
          insideOther = parityTest(mergedRayMesh, triToSrc, samplePoint, dir, s, raycaster, Math.max(minHitDistance, sampleEpsilon * 0.5));
        } catch (err) {
          // in case BVH or raycast throws, be conservative (treat as internal for this direction)
          insideOther = true;
        }

        // If parity says exposed (even intersections), then triangle is exposed for this direction
        if (!insideOther) {
          classifiedInternalInAllDirs = false;
          break;
        }

        // Fallback: try opposite side sample (mirrors original fallback)
        if (tryBothSides) {
          samplePoint.copy(centroid).addScaledVector(triNormal, -sampleEpsilon);
          try {
            const insideOther2 = parityTest(mergedRayMesh, triToSrc, samplePoint, dir, s, raycaster, Math.max(minHitDistance, sampleEpsilon * 0.5));
            if (!insideOther2) {
              classifiedInternalInAllDirs = false;
              break;
            }
          } catch (err) {
            // treat as internal for this direction
          }
        }
        // continue to next direction: if this direction says internal, we still need to test other directions
      } // end ray directions loop

      if (!classifiedInternalInAllDirs) {
        // keep triangle: push positions, normals (or triNormal), uvs (or placeholder)
        if (nArr) {
          pushTriangle(
            perMat[materialIndex],
            a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
            nArr[i0 * 3], nArr[i0 * 3 + 1], nArr[i0 * 3 + 2],
            nArr[i1 * 3], nArr[i1 * 3 + 1], nArr[i1 * 3 + 2],
            nArr[i2 * 3], nArr[i2 * 3 + 1], nArr[i2 * 3 + 2],
            uvArr ? uvArr[i0 * 2] : 0, uvArr ? uvArr[i0 * 2 + 1] : 0,
            uvArr ? uvArr[i1 * 2] : 1, uvArr ? uvArr[i1 * 2 + 1] : 0,
            uvArr ? uvArr[i2 * 2] : 0, uvArr ? uvArr[i2 * 2 + 1] : 1
          );
        } else {
          pushTriangle(
            perMat[materialIndex],
            a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
            triNormal.x, triNormal.y, triNormal.z,
            triNormal.x, triNormal.y, triNormal.z,
            triNormal.x, triNormal.y, triNormal.z,
            uvArr ? uvArr[i0 * 2] : 0, uvArr ? uvArr[i0 * 2 + 1] : 0,
            uvArr ? uvArr[i1 * 2] : 1, uvArr ? uvArr[i1 * 2 + 1] : 0,
            uvArr ? uvArr[i2 * 2] : 0, uvArr ? uvArr[i2 * 2 + 1] : 1
          );
        }
      } // otherwise triangle considered internal => skip

      processed++;
      if (yieldFn && (processed % (options.batchSize || 2000) === 0)) await yieldFn(processed);
    } // triangles
  } // sources

  // Build BufferGeometries per material & weld
  const geoms = [];
  const geomToMaterialIndex = [];
  for (let matIdx = 0; matIdx < perMat.length; matIdx++) {
    const b = perMat[matIdx];
    if (b.vertexCount === 0) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
    g.setIndex(b.indices);
    g.computeBoundingBox();
    g.computeBoundingSphere();

    const welded = BufferGeometryUtils.mergeVertices(g, weldTolerance);
    geoms.push(welded);
    geomToMaterialIndex.push(matIdx);
  }

  return { geoms, geomToMaterialIndex };
}

/* -------------------------
   Public API: sync + chunked
   ------------------------- */

/**
 * Synchronous optimized merge (robust).
 * Options (defaults shown):
 *  - sampleEpsilon = 1e-4
 *  - weldTolerance = 1e-5
 *  - minTriArea = 0
 *  - skipIfOutsideBbox = true
 *  - rayDirections = [ +X, +Y, +Z ]   (can pass array of THREE.Vector3)
 *  - minHitDistance = 1e-6
 *  - tryBothSides = true
 */
export function mergeGroupOptimizedSync(root, options = {}) {
  const { sources, materialList } = collectSources(root);
  if (!sources || sources.length === 0) return null;

  const { merged, triToSrc } = buildMergedRayGeometry(sources);

  // Attach BVH if available (fast raycasts)
  if (typeof MeshBVH !== 'undefined' && merged && !merged.boundsTree) {
    merged.boundsTree = new MeshBVH(merged, { lazyGeneration: false });
  }
  const mergedRayMesh = new THREE.Mesh(merged, raycastMaterial);
  mergedRayMesh.frustumCulled = false;

  // If user supplied rayDirections as raw vectors, copy them; otherwise use defaults
  if (options.rayDirections && Array.isArray(options.rayDirections)) {
    // normalize them
    options.rayDirections = options.rayDirections.map(v => {
      const vec = v.clone ? v.clone() : new THREE.Vector3(v.x, v.y, v.z);
      vec.normalize();
      return vec;
    });
  } else {
    options.rayDirections = options.rayDirections || DEFAULT_RAY_DIRS;
  }

  const { geoms, geomToMaterialIndex } = processTrianglesGeneric(sources, mergedRayMesh, triToSrc, materialList, options, null);

  if (!geoms || geoms.length === 0) return null;

  const mergedOut = BufferGeometryUtils.mergeGeometries(geoms, true);

  // remap group.materialIndex to materialList indices
  if (mergedOut.groups && mergedOut.groups.length && geomToMaterialIndex.length) {
    for (let gi = 0; gi < mergedOut.groups.length; gi++) {
      const group = mergedOut.groups[gi];
      const geomIndex = group.materialIndex;
      group.materialIndex = geomToMaterialIndex[geomIndex];
    }
  }

  const finalMesh = new THREE.Mesh(mergedOut, materialList.slice());
  finalMesh.geometry.computeBoundingBox();
  finalMesh.geometry.computeBoundingSphere();
  return finalMesh;
}

/**
 * Chunked (non-freezing) variant.
 * Same options as sync plus:
 *  - batchSize (defaults to 2000)
 *  - onProgress(processed, total) callback
 * Returns Promise<THREE.Mesh|null>
 */
export async function mergeGroupOptimizedChunked(root, options = {}) {
  const batchSize = options.batchSize ?? 2000;
  const onProgress = options.onProgress ?? (() => {});

  const { sources, materialList } = collectSources(root);
  if (!sources || sources.length === 0) return null;

  const { merged, triToSrc } = buildMergedRayGeometry(sources);
  if (typeof MeshBVH !== 'undefined' && merged && !merged.boundsTree) {
    merged.boundsTree = new MeshBVH(merged, { lazyGeneration: false });
  }
  const mergedRayMesh = new THREE.Mesh(merged, raycastMaterial);
  mergedRayMesh.frustumCulled = false;

  // normalize ray directions if given
  if (options.rayDirections && Array.isArray(options.rayDirections)) {
    options.rayDirections = options.rayDirections.map(v => {
      const vec = v.clone ? v.clone() : new THREE.Vector3(v.x, v.y, v.z);
      vec.normalize();
      return vec;
    });
  } else {
    options.rayDirections = options.rayDirections || DEFAULT_RAY_DIRS;
  }

  // compute total triangles for progress
  let totalTriangles = 0;
  for (let s = 0; s < sources.length; s++) totalTriangles += sources[s].geom.index.count / 3;

  // yield function used by processTrianglesGeneric
  async function yieldFn(processed) {
    // schedule a tick
    await new Promise(r => setTimeout(r, 0));
    onProgress(processed, totalTriangles);
  }

  const mergedResult = await processTrianglesGeneric(sources, mergedRayMesh, triToSrc, materialList, { ...options, batchSize }, yieldFn);

  const { geoms, geomToMaterialIndex } = mergedResult;
  if (!geoms || geoms.length === 0) {
    onProgress(totalTriangles, totalTriangles);
    return null;
  }

  const mergedOut = BufferGeometryUtils.mergeGeometries(geoms, true);
  if (mergedOut.groups && mergedOut.groups.length && geomToMaterialIndex.length) {
    for (let gi = 0; gi < mergedOut.groups.length; gi++) {
      const group = mergedOut.groups[gi];
      const geomIndex = group.materialIndex;
      group.materialIndex = geomToMaterialIndex[geomIndex];
    }
  }

  const finalMesh = new THREE.Mesh(mergedOut, materialList.slice());
  finalMesh.geometry.computeBoundingBox();
  finalMesh.geometry.computeBoundingSphere();
  onProgress(totalTriangles, totalTriangles);
  return finalMesh;
}
