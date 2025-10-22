// mergeOptimized.js
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// optional
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh"

// If three-mesh-bvh accelerated raycast is present, patch Mesh.raycast for large speedups
if (acceleratedRaycast) {
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

// Shared invisible material used for raycast wrapper meshes (prevents material=null crash)
const raycastMaterial = new THREE.MeshBasicMaterial({
  visible: false,
  side: THREE.DoubleSide
});

/**
 * Helper: collect sources (clone geometry + apply world transform)
 * Returns { sources, materialList }
 * where sources = [{ geom, materialIndex, bbox, srcMesh }]
 */
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

    // ensure index exists
    if (!geom.index) {
      const posCount = geom.attributes.position.count;
      const idx = new Uint32Array(posCount);
      for (let i = 0; i < posCount; i++) idx[i] = i;
      geom.setIndex(new THREE.BufferAttribute(idx, 1));
    }

    // compute bbox
    geom.computeBoundingBox();
    const bbox = geom.boundingBox ? geom.boundingBox.clone() : null;

    const matIndex = getMatIndex(obj.material);
    sources.push({ geom, materialIndex: matIndex, bbox, srcMesh: obj });
  });

  return { sources, materialList };
}

/**
 * Create raycast-ready wrapper meshes once and reuse.
 * If MeshBVH is available and not already built, attach boundsTree.
 */
function createRayMeshes(sources) {
  const rayMeshes = [];
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const geom = src.geom;

    // build BVH if MeshBVH is available and not built yet
    if (typeof MeshBVH !== 'undefined' && geom && !geom.boundsTree) {
      geom.boundsTree = new MeshBVH(geom, { lazyGeneration: false });
    }

    const tmp = new THREE.Mesh(geom, raycastMaterial);
    tmp.userData._sourceIndex = i; // identify which source it is
    tmp.frustumCulled = false;
    rayMeshes.push(tmp);
  }
  return rayMeshes;
}

/**
 * Process triangles synchronously and produce per-material BufferGeometry list.
 * This version welds per-material geometries BEFORE returning them and returns
 * a mapping from geometry index => original material index.
 *
 * Returns { geoms: BufferGeometry[], geomToMaterialIndex: number[] }
 */
function processTrianglesSync(sources, rayMeshes, materialList, options = {}) {
  const {
    sampleEpsilon = 1e-4,
    minTriArea = 0,
    skipIfOutsideBbox = true,
    weldTolerance = 1e-5
  } = options;

  // buckets per material
  const perMat = materialList.map(() => ({
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
    vertexCount: 0
  }));

  // reuse objects
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false; // need all intersections
  const dir = new THREE.Vector3(1, 0, 0); // fixed direction for parity test

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), triNormal = new THREE.Vector3();
  const centroid = new THREE.Vector3(), samplePoint = new THREE.Vector3();

  // cache bboxes for rayMesh quick skip
  const rayBBoxes = rayMeshes.map(m => (m.geometry && m.geometry.boundingBox) ? m.geometry.boundingBox.clone() : null);

  // iterate source geometries
  for (let s = 0; s < sources.length; s++) {
    const { geom, materialIndex } = sources[s];
    const posAttr = geom.attributes.position;
    const normAttr = geom.attributes.normal;
    const uvAttr = geom.attributes.uv;
    const index = geom.index.array;

    for (let ti = 0; ti < index.length; ti += 3) {
      const i0 = index[ti], i1 = index[ti + 1], i2 = index[ti + 2];

      a.fromBufferAttribute(posAttr, i0);
      b.fromBufferAttribute(posAttr, i1);
      c.fromBufferAttribute(posAttr, i2);

      // compute area (2x)
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      triNormal.crossVectors(ab, ac);
      const area2 = triNormal.length();
      if (area2 <= minTriArea) continue;
      triNormal.normalize();

      centroid.set(0, 0, 0).add(a).add(b).add(c).multiplyScalar(1 / 3);

      // first try offset along normal
      samplePoint.copy(centroid).addScaledVector(triNormal, sampleEpsilon);

      // QUICK BBOX TEST: if samplePoint is outside all other bboxes -> exposed
      if (skipIfOutsideBbox) {
        let insideAnyBbox = false;
        for (let j = 0; j < rayBBoxes.length; j++) {
          if (j === s) continue;
          const bb = rayBBoxes[j];
          if (!bb) { insideAnyBbox = true; break; }
          if (bb.containsPoint(samplePoint)) { insideAnyBbox = true; break; }
        }
        if (!insideAnyBbox) {
          pushTriangleToBucket(perMat[materialIndex], a, b, c, triNormal, normAttr, i0, i1, i2, uvAttr);
          continue;
        }
      }

      // raycast once against all rayMeshes
      raycaster.set(samplePoint, dir);
      const hits = raycaster.intersectObjects(rayMeshes, true);

      let intersections = 0;
      for (let h = 0; h < hits.length; h++) {
        // climb parents to find wrapper userData._sourceIndex reliably
        let obj = hits[h].object;
        let srcIndex = obj.userData && obj.userData._sourceIndex;
        while (srcIndex === undefined && obj.parent) {
          obj = obj.parent;
          srcIndex = obj.userData && obj.userData._sourceIndex;
        }
        if (srcIndex === s) continue;
        intersections++;
      }

      // parity test
      let insideOther = (intersections % 2) === 1;

      if (!insideOther) {
        // try the other side as fallback
        samplePoint.copy(centroid).addScaledVector(triNormal, -sampleEpsilon);
        raycaster.set(samplePoint, dir);
        const hits2 = raycaster.intersectObjects(rayMeshes, true);
        let inter2 = 0;
        for (let h = 0; h < hits2.length; h++) {
          let obj = hits2[h].object;
          let srcIndex = obj.userData && obj.userData._sourceIndex;
          while (srcIndex === undefined && obj.parent) {
            obj = obj.parent;
            srcIndex = obj.userData && obj.userData._sourceIndex;
          }
          if (srcIndex === s) continue;
          inter2++;
        }
        insideOther = (inter2 % 2) === 1;
      }

      if (insideOther) {
        // internal triangle -> skip
        continue;
      }

      // keep triangle
      pushTriangleToBucket(perMat[materialIndex], a, b, c, triNormal, normAttr, i0, i1, i2, uvAttr);
    }
  }

  // Build BufferGeometries per material AND weld per-material
  const geoms = [];
  const geomToMaterialIndex = []; // for remapping groups after merge
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

    // Weld vertices inside this material only (prevents UV/normal bleeding across materials)
    const welded = BufferGeometryUtils.mergeVertices(g, weldTolerance);
    geoms.push(welded);
    geomToMaterialIndex.push(matIdx);
  }

  return { geoms, geomToMaterialIndex };
}

// helper to append triangle into perMat bucket (copies normals/uvs if present)
function pushTriangleToBucket(bucket, a, b, c, triNormal, normAttr, i0, i1, i2, uvAttr) {
  const base = bucket.vertexCount;
  bucket.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);

  if (normAttr) {
    const na = new THREE.Vector3().fromBufferAttribute(normAttr, i0);
    const nb = new THREE.Vector3().fromBufferAttribute(normAttr, i1);
    const nc = new THREE.Vector3().fromBufferAttribute(normAttr, i2);
    bucket.normals.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
  } else {
    bucket.normals.push(
      triNormal.x, triNormal.y, triNormal.z,
      triNormal.x, triNormal.y, triNormal.z,
      triNormal.x, triNormal.y, triNormal.z
    );
  }

  if (uvAttr) {
    const ua = new THREE.Vector2().fromBufferAttribute(uvAttr, i0);
    const ub = new THREE.Vector2().fromBufferAttribute(uvAttr, i1);
    const uc = new THREE.Vector2().fromBufferAttribute(uvAttr, i2);
    bucket.uvs.push(ua.x, ua.y, ub.x, ub.y, uc.x, uc.y);
  } else {
    bucket.uvs.push(0, 0, 1, 0, 0, 1);
  }

  bucket.indices.push(base, base + 1, base + 2);
  bucket.vertexCount += 3;
}

/**
 * Public: optimized synchronous merge (may still be heavy for very large scenes).
 *
 * options:
 *   sampleEpsilon = number
 *   weldTolerance = number
 *   minTriArea = number
 *   skipIfOutsideBbox = boolean
 */
export function mergeGroupOptimizedSync(root, options = {}) {
  const { sources, materialList } = collectSources(root);
  if (sources.length === 0) return null;

  const rayMeshes = createRayMeshes(sources);

  const { geoms, geomToMaterialIndex } = processTrianglesSync(sources, rayMeshes, materialList, options);
  if (!geoms || geoms.length === 0) return null;

  // Merge per-material geometries into one geometry (useGroups=true creates groups referencing geometries' indices)
  const merged = BufferGeometryUtils.mergeGeometries(geoms, true);

  // Remap groups' materialIndex (group.materialIndex currently references geometry index in `geoms`)
  if (merged.groups && merged.groups.length && geomToMaterialIndex && geomToMaterialIndex.length) {
    for (let gi = 0; gi < merged.groups.length; gi++) {
      const group = merged.groups[gi];
      const geomIndex = group.materialIndex;
      group.materialIndex = geomToMaterialIndex[geomIndex];
    }
  }

  // Build final mesh using materialList (materialList indexes match materialIndex in sources/geomToMaterialIndex)
  const finalMesh = new THREE.Mesh(merged, materialList.slice());
  finalMesh.geometry.computeBoundingBox();
  finalMesh.geometry.computeBoundingSphere();
  return finalMesh;
}

/**
 * Public: chunked (non-freezing) version.
 * same options plus:
 *   batchSize = triangles per batch before yielding (default 2000)
 *   onProgress = (processedTriangles, totalTriangles) => void
 * returns Promise<THREE.Mesh|null>
 */
export async function mergeGroupOptimizedChunked(root, options = {}) {
  const batchSize = options.batchSize ?? 2000;
  const onProgress = options.onProgress ?? (() => {});

  const { sources, materialList } = collectSources(root);
  if (!sources || sources.length === 0) return null;

  const rayMeshes = createRayMeshes(sources);

  // compute total triangles for progress
  let totalTriangles = 0;
  for (let s = 0; s < sources.length; s++) {
    totalTriangles += sources[s].geom.index.count / 3;
  }

  // perMat init
  const perMat = materialList.map(() => ({ positions: [], normals: [], uvs: [], indices: [], vertexCount: 0 }));

  // reused objects
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false;
  const dir = new THREE.Vector3(1, 0, 0);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), triNormal = new THREE.Vector3();
  const centroid = new THREE.Vector3(), samplePoint = new THREE.Vector3();

  let processed = 0;
  const rayBBoxes = rayMeshes.map(m => (m.geometry && m.geometry.boundingBox) ? m.geometry.boundingBox.clone() : null);

  // iterate through sources and triangles in batches
  for (let s = 0; s < sources.length; s++) {
    const { geom, materialIndex } = sources[s];
    const posAttr = geom.attributes.position;
    const normAttr = geom.attributes.normal;
    const uvAttr = geom.attributes.uv;
    const index = geom.index.array;

    for (let ti = 0; ti < index.length; ti += 3) {
      const i0 = index[ti], i1 = index[ti + 1], i2 = index[ti + 2];

      a.fromBufferAttribute(posAttr, i0);
      b.fromBufferAttribute(posAttr, i1);
      c.fromBufferAttribute(posAttr, i2);

      ab.subVectors(b, a);
      ac.subVectors(c, a);
      triNormal.crossVectors(ab, ac);
      const area2 = triNormal.length();
      if (area2 <= (options.minTriArea ?? 0)) {
        processed++;
        if (processed % batchSize === 0) {
          await new Promise(r => setTimeout(r, 0));
          onProgress(processed, totalTriangles);
        }
        continue;
      }
      triNormal.normalize();

      centroid.set(0, 0, 0).add(a).add(b).add(c).multiplyScalar(1 / 3);
      samplePoint.copy(centroid).addScaledVector(triNormal, options.sampleEpsilon ?? 1e-4);

      // bbox quick test
      let insideAnyBbox = false;
      if (options.skipIfOutsideBbox ?? true) {
        for (let j = 0; j < rayBBoxes.length; j++) {
          if (j === s) continue;
          const bb = rayBBoxes[j];
          if (!bb) { insideAnyBbox = true; break; }
          if (bb.containsPoint(samplePoint)) { insideAnyBbox = true; break; }
        }
      } else {
        insideAnyBbox = true;
      }

      if (!insideAnyBbox) {
        pushTriangleToBucket(perMat[materialIndex], a, b, c, triNormal, normAttr, i0, i1, i2, uvAttr);
        processed++;
        if (processed % batchSize === 0) {
          await new Promise(r => setTimeout(r, 0));
          onProgress(processed, totalTriangles);
        }
        continue;
      }

      // raycast
      raycaster.set(samplePoint, dir);
      const hits = raycaster.intersectObjects(rayMeshes, true);

      let intersections = 0;
      for (let h = 0; h < hits.length; h++) {
        let obj = hits[h].object;
        let srcIndex = obj.userData && obj.userData._sourceIndex;
        while (srcIndex === undefined && obj.parent) {
          obj = obj.parent;
          srcIndex = obj.userData && obj.userData._sourceIndex;
        }
        if (srcIndex === s) continue;
        intersections++;
      }

      let insideOther = (intersections % 2) === 1;
      if (!insideOther) {
        // try other side
        samplePoint.copy(centroid).addScaledVector(triNormal, -(options.sampleEpsilon ?? 1e-4));
        raycaster.set(samplePoint, dir);
        const hits2 = raycaster.intersectObjects(rayMeshes, true);
        let inter2 = 0;
        for (let h = 0; h < hits2.length; h++) {
          let obj = hits2[h].object;
          let srcIndex = obj.userData && obj.userData._sourceIndex;
          while (srcIndex === undefined && obj.parent) {
            obj = obj.parent;
            srcIndex = obj.userData && obj.userData._sourceIndex;
          }
          if (srcIndex === s) continue;
          inter2++;
        }
        insideOther = (inter2 % 2) === 1;
      }

      if (!insideOther) {
        pushTriangleToBucket(perMat[materialIndex], a, b, c, triNormal, normAttr, i0, i1, i2, uvAttr);
      }

      processed++;
      if (processed % batchSize === 0) {
        await new Promise(r => setTimeout(r, 0)); // yield
        onProgress(processed, totalTriangles);
      }
    }
  }

  // Build BufferGeometries per material AND weld per-material
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

    const welded = BufferGeometryUtils.mergeVertices(g, options.weldTolerance ?? 1e-5);
    geoms.push(welded);
    geomToMaterialIndex.push(matIdx);
  }

  if (geoms.length === 0) return null;

  // Merge all geometries into one with groups, then remap group.materialIndex => original material index
  const merged = BufferGeometryUtils.mergeGeometries(geoms, true);

  if (merged.groups && merged.groups.length && geomToMaterialIndex.length) {
    for (let gi = 0; gi < merged.groups.length; gi++) {
      const group = merged.groups[gi];
      const geomIndex = group.materialIndex;
      group.materialIndex = geomToMaterialIndex[geomIndex];
    }
  }

  const finalMesh = new THREE.Mesh(merged, materialList.slice());
  finalMesh.geometry.computeBoundingBox();
  finalMesh.geometry.computeBoundingSphere();
  return finalMesh;
}