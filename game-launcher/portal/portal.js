import * as THREE from "three";
import Projector from "./projector";

export default class Portal
{
    renderTarget
    camera
    projector
    scene
    material
    plane
    aabb
    sky

    fov = 70
    distance = 0

    initPosition
    initRotation

    shiftPosition = new THREE.Vector3()
    shiftRotation = new THREE.Euler()

    constructor(sx=2, sy=3, x=0, y=0, z=0, initPosition = new THREE.Vector3(), initRotation = new THREE.Vector3(), sky = null, scene = window.scene)
    {
        this.initPosition = initPosition;
        this.initRotation = initRotation;
        this.scene = scene
        this.sky = sky

        // Render Target
        this.renderTarget = new THREE.WebGLRenderTarget(512, 512,
        {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: true,
            stencilBuffer: false,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.RepeatWrapping
        });


        // Camera
        this.camera = new THREE.PerspectiveCamera();
        this.camera.fov = window.mainCamera.fov;
        this.camera.aspect = window.mainCamera.aspect;
        this.scene.add(this.camera)

        // Material
        this.material = new THREE.MeshBasicMaterial
        ({
            map: this.renderTarget.texture,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.material.onBeforeCompile = (shader) =>
        {
            shader.uniforms.uTexture = { value: this.renderTarget.texture };

            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `
                #include <common>
                varying vec4 vProjCoord;
                `
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `
                #include <project_vertex>
                // store clip-space position for screen-space projection
                vProjCoord = gl_Position;
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `
                #include <common>
                varying vec4 vProjCoord;
                uniform sampler2D uTexture;
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                #ifdef USE_MAP
                // Perspective divide to get normalized device coords (-1 to 1)
                vec2 ndc = vProjCoord.xy / vProjCoord.w;
                // Convert to [0,1] screen UVs
                vec2 screenUv = 0.5 * ndc + 0.5;
                // Sample render target texture
                vec4 texelColor = texture2D(uTexture, screenUv);
                diffuseColor *= texelColor;
                #endif
                `
            );

            this.material.userData.shader = shader;
        };

        // Plane
        this.plane = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), this.material);
        this.plane.position.set(x+.5, y, z+.5);
        window.scene.add(this.plane);

        // Culling
        this.aabb = new THREE.Box3(new THREE.Vector3(this.plane.position.x-1, this.plane.position.y-1.5, this.plane.position.z-1), new THREE.Vector3(this.plane.position.x+1, this.plane.position.y+1.5, this.plane.position.z+1))

        // Render Event
        let first = false;
        window.addRenderListener((clock, frustum) =>
        {
            if(!frustum.intersectsBox(this.aabb)){return}

            if(!first){first=true; this.resize(window.innerWidth, window.innerHeight)}

            // Transform
            this.cameraTransform()

            // Render
            window.renderer.setRenderTarget(this.renderTarget);
            window.renderer.clear(false, true, false);
            window.renderer.render( this.scene, this.camera )

            if(this.material.userData.shader) { this.material.userData.shader.uniforms.uTexture.value = this.renderTarget.texture }

            window.renderer.setRenderTarget(null);
            window.renderer.clear(false, true, false);
        }, true)

        // Resize Event
        window.addResizeListener((...args) => {this.resize(...args)})

        this.cameraTransform()
    }

    project(video, objects)
    {
        if(this.sky){objects.push(this.sky)}
        if(this.sky?.material) {this.sky.material.transparent = true}

        const videoTex = new THREE.VideoTexture(video);
        
        const projector = new Projector(videoTex, objects, this.scene)
        this.projector = projector

        // Projection Camera
        this.projector.camera.fov = this.fov;
        this.projector.camera.aspect = this.camera.aspect;

        this.projector.camera.position.set(this.initPosition.x, this.initPosition.y, this.initPosition.z)
        this.projector.camera.rotation.set(this.initRotation.x - this.plane.rotation.x, this.initRotation.y - this.plane.rotation.y, this.initRotation.z - this.plane.rotation.z, 'YXZ')

        // this.projector.camera.setViewOffset(window.innerWidth, window.innerHeight, window.innerWidth/2, -3, window.innerWidth/2, window.innerHeight/2)
        this.projector.camera.setViewOffset(window.innerWidth, window.innerHeight, window.innerWidth/2, -32, window.innerWidth/2, window.innerHeight/2+16)

        this.projector.camera.updateProjectionMatrix();
        this.projector.camera.updateMatrixWorld(true);

        window.projectorCamera = this.projector.camera;
        window.video = this.video;

        // window.scene.add(this.projector.camera, new THREE.CameraHelper(this.projector.camera))
    }

    resize(w, h)
    {
        this.renderTarget.setSize(Math.floor(w * window.renderer.getPixelRatio()), Math.floor(h * window.renderer.getPixelRatio()));

        this.camera.aspect = this.renderTarget.width / this.renderTarget.height;
        this.camera.updateProjectionMatrix();

        if(this.projector?.camera)
        {
            this.projector.camera.aspect = this.camera.aspect
            this.projector.camera.setViewOffset(window.innerWidth, window.innerHeight, window.innerWidth/2, -32, window.innerWidth/2, window.innerHeight/2+16)
            this.projector.camera.updateProjectionMatrix()
        }
    }

    cameraTransform()
    {
        this.distance = Math.max(0, Math.min(window.mainCamera.position.distanceTo(this.plane.position)/1.5 - .25, 1));

        this.camera.position.set(this.initPosition.x + this.shiftPosition.x*this.distance, this.initPosition.y + this.shiftPosition.y*this.distance, this.initPosition.z + this.shiftPosition.z*this.distance)

        const additive = new THREE.Vector3(
            (window.mainCamera.position.x-(this.plane.position.x + this.shiftPosition.x)) * this.distance,
            (window.mainCamera.position.y-(this.plane.position.y + this.shiftPosition.y)) * this.distance,
            (window.mainCamera.position.z-(this.plane.position.z + this.shiftPosition.z)) * Math.max(0, Math.min(window.mainCamera.position.distanceTo(this.plane.position)*2 - .8, 1))
        )

        const baseEuler = new THREE.Euler(
            ((this.initRotation.x)*(1-this.distance)) - this.plane.rotation.x,
            // this.initRotation.x - this.plane.rotation.x,
            (this.initRotation.y) - this.plane.rotation.y,
            (this.initRotation.z) - this.plane.rotation.z,
            'YXZ'
        );

        // console.log(`${additive.x} ${additive.y} ${additive.z}`)
        additive.applyEuler(baseEuler)
        // console.log(`${additive.x} ${additive.y} ${additive.z}`)
        this.camera.position.add(additive)


        const baseQuat = new THREE.Quaternion().setFromEuler(baseEuler);

        const mainWorldQuat = new THREE.Quaternion();
        window.mainCamera.getWorldQuaternion(mainWorldQuat);

        const planeWorldQuat = new THREE.Quaternion();
        this.plane.getWorldQuaternion(planeWorldQuat);


        const mainRelToPlane = planeWorldQuat.clone().invert().multiply(mainWorldQuat).normalize();

        let localDeltaQuat = baseQuat.clone().multiply(mainRelToPlane).normalize();

        const w = Math.max(-1, Math.min(1, localDeltaQuat.w));
        const angle = 2 * Math.acos(w);
        const s = Math.sqrt(1 - w * w);
        const eps = 1e-6;
        const axis = s < eps ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(localDeltaQuat.x / s, localDeltaQuat.y / s, localDeltaQuat.z / s);

        let scaledDeltaQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        scaledDeltaQuat = baseQuat.clone().invert().multiply(scaledDeltaQuat);

        this.camera.quaternion.copy(baseQuat).multiply(scaledDeltaQuat);
        this.camera.rotation.setFromQuaternion(quatLerp(baseQuat, this.camera.quaternion, this.distance), 'YXZ');

        this.camera.fov = window.mainCamera.fov*this.distance +  this.fov*(1-this.distance)

        // if(this.sky?.material?.opacity) {this.sky.material.opacity = this.distance}
        if(this.projector)
        {
            // const q1 = new THREE.Quaternion().setFromEuler(this.projector.camera.rotation);
            // const q2 = new THREE.Quaternion().setFromEuler(window.mainCamera.rotation);
            
            const desiredDir = new THREE.Vector3(window.mainCamera.position.x - this.plane.position.x,
                window.mainCamera.position.y - this.plane.position.y,
                window.mainCamera.position.z - this.plane.position.z
            ).normalize()
            const camDir = new THREE.Vector3();
            this.projector.camera.getWorldDirection(camDir);

            // (q1.angleTo(q2)/Math.PI)
            const d =  1 - Math.min(.8, Math.max(0, window.mainCamera.position.distanceTo(this.plane.position)/4 - .2 ));
            this.projector.mix = Math.max(Math.max(0, .8-this.distance), Math.max(.05, (Math.min(1, Math.max(0, (1-desiredDir.dot(camDir.normalize()))*2)) * d/2)))
        }

        if(this.sky) { this.sky.position.copy(this.camera.position) }

        // this.projector.camera?.rotation.copy(this.camera.rotation)
        // this.projector.camera?.position.copy(this.camera.position)
    }
}

// Utily
function quatLerp(q1, q2, t) 
{
    // simple component-wise linear interpolation
    const lerpQuat = new THREE.Quaternion(
        q1.x + (q2.x - q1.x) * t,
        q1.y + (q2.y - q1.y) * t,
        q1.z + (q2.z - q1.z) * t,
        q1.w + (q2.w - q1.w) * t
    );
    lerpQuat.normalize(); // normalize after linear interpolation
    return lerpQuat;
}