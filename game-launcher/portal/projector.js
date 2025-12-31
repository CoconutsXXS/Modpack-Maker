import * as THREE from "three";

export default class Projector
{
    scene
    camera
    videoTex
    mix = 0
    objects = []
    constructor(videoTex, objects = [], scene = window.scene)
    {
        this.videoTex = videoTex;
        this.objects = objects;
        this.scene = scene

        this.camera = new THREE.PerspectiveCamera()
        this.scene.add(this.camera)
        // this.camera.fov = 70;
        // this.camera.aspect = window.mainCamera.aspect;
        // this.camera.position.set(0, 10, 0)
        // this.camera.rotation.set(THREE.MathUtils.degToRad(-90), 0, 0, 'YXZ')
        this.camera.updateProjectionMatrix();

        this.size = 1024; // choose resolution (lower = cheaper but blurrier)
        const depthTexture = new THREE.DepthTexture(this.size, this.size);
        depthTexture.type = THREE.FloatType; // FloatType gives better precision; UnsignedShortType is smaller
        depthTexture.minFilter = THREE.NearestFilter;
        depthTexture.magFilter = THREE.NearestFilter;

        this.projectorRT = new THREE.WebGLRenderTarget(this.size, this.size,
        {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthTexture: depthTexture,
            depthBuffer: true,
        });

        for(let o of objects)
        {
            if (o.isMesh && o.material) { for(const m of Array.isArray(o.material)?o.material:[o.material]) { if(!m){continue} this.injectProjectorToMaterial(m, this.videoTex) }}

            o.traverse(mesh =>
            {
                if (mesh.isMesh && mesh.material)
                {
                    for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]) { if(!m){continue} this.injectProjectorToMaterial(m, this.videoTex) }
                }
            })
        }

        window.addRenderListener(() =>
        {
            this.updateProjectorUniforms(this.scene)
        })
    }

    injectProjectorToMaterial(material, videoTexture)
    {
        material.onBeforeCompile = (shader) =>
        {
            // uniforms
            shader.uniforms.projectorMap = { value: videoTexture };
            shader.uniforms.projectorMatrix = { value: new THREE.Matrix4() };
            shader.uniforms.mixWeight = { value: .5 };
            // vertex: declare varying/uniform
            shader.vertexShader = 
                `uniform mat4 projectorMatrix;
                varying vec4 vProjCoord;
                `
                + shader.vertexShader;

            // Replace begin_vertex to compute worldPos including instanceMatrix when present
            shader.vertexShader = shader.vertexShader.replace
            (
                '#include <begin_vertex>',
                `#include <begin_vertex>
                #ifdef USE_INSTANCING
                    vec4 worldPos = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
                #else
                    vec4 worldPos = modelMatrix * vec4( transformed, 1.0 );
                #endif
                vProjCoord = projectorMatrix * worldPos;`
            );
            // fragment: declare
            shader.fragmentShader = 
            `uniform sampler2D projectorMap;
            varying vec4 vProjCoord;
            uniform float mixWeight;
            `
            + shader.fragmentShader;

            // Insert sampling inside main() by inserting before last '}' (safe)
            const projCode =
            `vec3 projNDC = vProjCoord.xyz / vProjCoord.w;
            vec2 projUV = projNDC.xy * 0.5 + 0.5;
            if(projUV.x >= 0.0 && projUV.x <= 1.0 && projUV.y >= 0.0 && projUV.y <= 1.0 && vProjCoord.z > 0.0)
            {
                vec3 projColor = texture2D(projectorMap, projUV).rgb;
                // simple additive blend into existing fragment color
                // gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb + projColor, 0.9);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, projColor, mixWeight);
            }`;

            // put projCode inside main() by replacing the final '}'
            if (/\}\s*$/.test(shader.fragmentShader))
            {
                shader.fragmentShader = shader.fragmentShader.replace(/\}\s*$/, projCode + '\n}');
            }
            else
            {
                shader.fragmentShader += '\n' + projCode;
                console.warn('projector injection: fallback append (could not find final brace).');
            }
            material.userData._projectorShader = shader;
        };
        material.needsUpdate = true;

        return material
    }

    biasMatrix = new THREE.Matrix4().set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0
    );
    projectorPV = new THREE.Matrix4();
    updateProjectorUniforms(scene)
    {
        // Fix Materials
        for(let o of this.objects)
        {
            if(o?.material?.[0]?.userData?._projectorShader || o?.material?.userData?._projectorShader){continue}
            
            if (o.isMesh && o.material) { for(const m of Array.isArray(o.material)?o.material:[o.material]) { if(!m){continue} this.injectProjectorToMaterial(m, this.videoTex) }}
            o.traverse(mesh =>
            {
                if (mesh.isMesh && mesh.material)
                {
                    for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]) { if(!m){continue} this.injectProjectorToMaterial(m, this.videoTex) }
                }
            })
        }

        this.updateProjectorPV();
        scene.traverse((obj) =>
        {
            if (!obj.isMesh) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats)
            {
                if (!mat) continue;
                const s = mat.userData._projectorShader;
                if (s && s.uniforms && s.uniforms.projectorMatrix)
                {
                    s.uniforms.projectorMatrix.value.copy(this.projectorPV);
                    s.uniforms.mixWeight.value = this.mix
                }
            }
        });
    }
    updateProjectorPV()
    {
        if (!this.camera) return;
        this.projectorPV.copy(this.biasMatrix).multiply(this.camera.projectionMatrix).multiply(this.camera.matrixWorldInverse);
    }
}