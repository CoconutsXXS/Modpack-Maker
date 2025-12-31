import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from "three"
import GUI from './gui';

// export function setupPlayer(x = 10, y = 10, z = 10)
// {
//     // Collider
//     const rigidbodyDesc = RAPIER.RigidBodyDesc.dynamic()
//     .setTranslation(x, y, z)
//     .lockRotations();
//     const body = window.world.createRigidBody(rigidbodyDesc);

//     const colliderDesc = RAPIER.ColliderDesc.cuboid(0.35, 0.95, 0.35);
//     colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

//     const collider = window.world.createCollider(colliderDesc, body);
//     collider.setFriction(1);

//     // Input
//     const keys = { forward:0, right:0, jump:false };
//     window.addEventListener('keydown', (e) =>
//     {
//         if (e.code === 'KeyW') keys.forward = 1;
//         if (e.code === 'KeyS') keys.forward = -1;
//         if (e.code === 'KeyA') keys.right = -1;
//         if (e.code === 'KeyD') keys.right = 1;
//         if (e.code === 'Space') keys.jump = true;
//     });
//     window.addEventListener('keyup', (e) =>
//     {
//         if (e.code === 'KeyW' && keys.forward > 0) keys.forward = 0;
//         if (e.code === 'KeyS' && keys.forward < 0) keys.forward = 0;
//         if (e.code === 'KeyA' && keys.right < 0) keys.right = 0;
//         if (e.code === 'KeyD' && keys.right > 0) keys.right = 0;
//         if (e.code === 'Space') keys.jump = false;
//     });

//     // Parameters
//     const parameters =
//     {
//         speed: 2,
//         jumpSpeed: 4,
//         xSensibility: 0.003,
//         ySensibility: 0.003
//     }

//     // Moves
//     window.addRenderListener(() =>
//     {
//         let wishDir = new THREE.Vector3(keys.right, 0, -keys.forward);
//         if (wishDir.lengthSq() > 0.0001) wishDir.normalize();

//         // transform wishDir by camera y rotation if you want camera-relative movement:
//         wishDir.applyAxisAngle(new THREE.Vector3(0,1,0), window.mainCamera.rotation.y);

//         const curVel = body.linvel();
//         const curVy = curVel.y;
//         // curVel.free(); 

//         let newVy = curVy;
//         if (keys.jump && true)
//         {
//             newVy = parameters.jumpSpeed;
//         }

//         body.setTranslation(new RAPIER.Vector3(body.translation().x, body.translation().y+0.001, body.translation().z))
//         body.setLinvel({ x: wishDir.x * parameters.speed, y: newVy, z: wishDir.z * parameters.speed }, true);

//         window.mainCamera.position.set(body.translation().x, body.translation().y+0.9, body.translation().z)

//         // Graphic Sync
//         // const pos = body.translation();
//         // playerMesh.position.set(pos.x, pos.y, pos.z);

//         // const rot = body.rotation();
//         // playerMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
//     })

//     if(!window.debug) { window.debug = {} }
//     window.debug.setPlayerPos = (x,y,z) => { body.setTranslation(new RAPIER.Vector3(x,y,z), true); body.setLinvel(new RAPIER.Vector3(0,0,0)) }

//     // Camera
//     window.canvas.addEventListener("click", () => {if(!window.debug.isFreeCamera){window.canvas.requestPointerLock()}})
//     window.canvas.requestPointerLock();

//     let lastMousePosition = null;
//     let pitch = 0;
//     let yaw = 0;
//     document.addEventListener("mousemove", (ev) =>
//     {
//         if (document.pointerLockElement != canvas || window.debug.isFreeCamera==true){return}

//         if(!lastMousePosition){lastMousePosition={x:ev.clientX, y:ev.clientY}; return}

//         pitch -= ev.movementY*parameters.ySensibility
//         yaw -= ev.movementX*parameters.xSensibility

//         window.mainCamera.rotation.set(pitch, yaw, 0, 'YXZ'); 
        
//         lastMousePosition={x:ev.clientX, y:ev.clientY};
//     })

//     // Block Placing
//     // window.scene.add(new THREE.CameraHelper(window.mainCamera))
//     const raycaster = new THREE.Raycaster();
//     document.addEventListener("click", () =>
//     {
//         raycaster.setFromCamera( new THREE.Vector2(0,0), window.mainCamera );
//         const intersect = raycaster.intersectObjects( window.scene.children, true );

//         const hit = intersect[0];
//         if(!hit){return}

//         // const c = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshBasicMaterial({color: 0x00ff00}))
//         // c.position.copy(hit.point)
//         // window.scene.add(c)

//         const pos = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z)
//         pos.add(hit.normal.multiplyScalar(.5))

//         // const c = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshBasicMaterial({color: 0x00ff00}))
//         // c.position.copy(pos)
//         // window.scene.add(c)

//         window.mcWorld.placeBlock(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z), "minecraft:dirt")
//     })
// }

export class Player
{
    body
    parameters =
    {
        speed: 2,
        jumpSpeed: 4,
        xSensibility: 0.003,
        ySensibility: 0.003
    }
    gui
    enabled = true

    constructor(x = 0, y = 2, z = 0, gameData = window, jar = window.jar)
    {
        this.gui = new GUI(jar)

        // Collider
        const rigidbodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).lockRotations(true);
        this.body = gameData.world.createRigidBody(rigidbodyDesc);

        const colliderDesc = RAPIER.ColliderDesc.capsule(0.9/2, 0.3).setFriction(0.0).setRestitution(0.0);
        colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        gameData.world.createCollider(colliderDesc, this.body);
        this.body.setLinearDamping(0);
        this.body.setAngularDamping(0);

        // Input
        const keys = { forward:0, right:0, jump:false, sprinting:false };
        window.addEventListener('keydown', (e) =>
        {
            if (e.code === 'KeyW') keys.forward = 1;
            if (e.code === 'KeyS') keys.forward = -1;
            if (e.code === 'KeyA') keys.right = -1;
            if (e.code === 'KeyD') keys.right = 1;
            if (e.code === 'Space') {  keys.jump = true; if(this.enabled){document.activeElement.blur(); e.preventDefault();} }
            if (e.ctrlKey) keys.sprinting = true;
        });
        window.addEventListener('keyup', (e) =>
        {
            if (e.code === 'KeyW' && keys.forward > 0) keys.forward = 0;
            if (e.code === 'KeyS' && keys.forward < 0) keys.forward = 0;
            if (e.code === 'KeyA' && keys.right < 0) keys.right = 0;
            if (e.code === 'KeyD' && keys.right > 0) keys.right = 0;
            if (e.code === 'Space') keys.jump = false;
            if (e.ctrlKey) keys.sprinting = false;
        });

        // Moves
        const tps = 60;
        const JUMP_VELOCITY_TICK = 0.41999998688697815;
        const JUMP_VELOCITY_MS = JUMP_VELOCITY_TICK * 20;
        const VERTICAL_DRAG_PER_TICK = 0.98;
        const BASE_WALK_SPEED_MS = 4.317;

        gameData.world.timestep = 1 / tps;

        let lastJumpKey = false;

        setInterval(() =>
        {
            this.gui.enabled = this.enabled
            if(!this.enabled){ return }

            const vel = this.body.linvel();

            const onGround = true

            const nowJump = keys.jump && !lastJumpKey && onGround;
            if (nowJump)
            {
                this.body.setLinvel({ x: vel.x, y: JUMP_VELOCITY_MS, z: vel.z }, true);
            }
            lastJumpKey = keys.jump;

            gameData.world.step();

            const afterVel = this.body.linvel();
            const newVy = afterVel.y * VERTICAL_DRAG_PER_TICK;
            let curVx = afterVel.x;
            let curVz = afterVel.z;

            const targetSpeed = keys.sprinting ? BASE_WALK_SPEED_MS * 1.3 : BASE_WALK_SPEED_MS;

            const desired = new THREE.Vector3(keys.right, 0, -keys.forward);
            if (desired.lengthSq() > 1e-4) desired.normalize();
            desired.applyAxisAngle(new THREE.Vector3(0, 1, 0), gameData.mainCamera.rotation.y);
            desired.multiplyScalar(targetSpeed);

            const accelFactor = onGround ? 0.2 : 0.02;

            const blendedX = curVx + (desired.x - curVx) * accelFactor;
            const blendedZ = curVz + (desired.z - curVz) * accelFactor;

            this.body.setLinvel({ x: blendedX, y: newVy, z: blendedZ }, true);

            const t = this.body.translation();
            gameData.mainCamera.position.set(t.x, t.y + 1.62 - 0.9, t.z);
        }, 1000 / tps);

        if(!gameData.debug) { gameData.debug = {} }
        gameData.debug.setPlayerPos = (x,y,z) => { this.body.setTranslation(new RAPIER.Vector3(x,y,z), true); this.body.setLinvel(new RAPIER.Vector3(0,0,0)) }

        // Camera
        gameData.canvas.addEventListener("click", (ev) => {if(!gameData.debug.isFreeCamera && this.enabled){lastMousePosition={x:ev.clientX, y:ev.clientY}; document.activeElement.blur(); gameData.canvas.requestPointerLock(); ev.preventDefault()}})

        let lastMousePosition = null;
        let pitch = 0;
        let yaw = 0;
        document.addEventListener("mousemove", (ev) =>
        {
            if(!this.enabled) { lastMousePosition={x:ev.clientX, y:ev.clientY}; return; }
            if (document.pointerLockElement != gameData.canvas || gameData.debug?.isFreeCamera==true){return}

            if(!lastMousePosition){lastMousePosition={x:ev.clientX, y:ev.clientY}; return}

            pitch -= ev.movementY*this.parameters.ySensibility
            yaw -= ev.movementX*this.parameters.xSensibility

            gameData.mainCamera.rotation.set(pitch, yaw, 0, 'YXZ'); 
            
            lastMousePosition={x:ev.clientX, y:ev.clientY};
        })

        // Block Placing
        let itemId = null
        const raycaster = new THREE.Raycaster();
        document.addEventListener("click", (e) =>
        {
            if(!this.enabled){return}
            raycaster.setFromCamera( new THREE.Vector2(0,0), gameData.mainCamera );
            const intersect = raycaster.intersectObjects( gameData.scene.children, true );

            const hit = intersect[0];
            if(!hit){return}

            const pos = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z)

            if(e.button == 2)
            {
                if(!itemId){return}
                pos.add(hit.normal.multiplyScalar(.51))
                let axis = 'y'
                const camDir = new THREE.Vector3()
                gameData.mainCamera.getWorldDirection(camDir)
                const abs = [Math.abs(camDir.x), Math.abs(camDir.y), Math.abs(camDir.z)]
                if(abs[0] > abs[1] && abs[0] > abs[2]) { axis = 'x' }
                else if(abs[1] > abs[0] && abs[1] > abs[2]) { axis = 'y' }
                else if(abs[2] > abs[1] && abs[2] > abs[0]) { axis = 'z' }

                gameData.mcWorld.placeBlock(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z), itemId, {axis, type: "bottom"})
            }
            else if (e.button == 0)
            {
                pos.add(hit.normal.multiplyScalar(-.51))
                gameData.mcWorld.placeBlock(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z), 'minecraft:air')
            }
        })

        const wire = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({wireframe: true, color: 0x000000, wireframeLinewidth: 1, wireframeLinejoin: 'round', wireframeLinecap: 'round'}))
        // gameData.scene.add(wire)
        // gameData.addRenderListener(() =>
        // {
        //     return;
        //     raycaster.setFromCamera( new THREE.Vector2(0,0), gameData.mainCamera );
        //     const intersect = raycaster.intersectObjects( gameData.scene.children, true );

        //     const hit = intersect[0];
        //     if(!hit){ wire.visible = false; return}
        //     wire.visible = true;

        //     const pos = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z).sub(hit.normal.multiplyScalar(.51))
        //     wire.position.set(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z))
        // })

        // GUI
        document.body.appendChild(this.gui.container)

        this.gui.onSelectHotbar = (i) =>
        {
            itemId = this.gui.slotsData[i]
        }
    }
}