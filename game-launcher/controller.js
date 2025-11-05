import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from "three"

export function setupPlayer(x = 10, y = 10, z = 10)
{
    // Collider
    const rigidbodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .lockRotations();
    const body = window.world.createRigidBody(rigidbodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.35, 0.95, 0.35);
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const collider = window.world.createCollider(colliderDesc, body);
    collider.setFriction(1);

    // Input
    const keys = { forward:0, right:0, jump:false };
    window.addEventListener('keydown', (e) =>
    {
        if (e.code === 'KeyW') keys.forward = 1;
        if (e.code === 'KeyS') keys.forward = -1;
        if (e.code === 'KeyA') keys.right = -1;
        if (e.code === 'KeyD') keys.right = 1;
        if (e.code === 'Space') keys.jump = true;
    });
    window.addEventListener('keyup', (e) =>
    {
        if (e.code === 'KeyW' && keys.forward > 0) keys.forward = 0;
        if (e.code === 'KeyS' && keys.forward < 0) keys.forward = 0;
        if (e.code === 'KeyA' && keys.right < 0) keys.right = 0;
        if (e.code === 'KeyD' && keys.right > 0) keys.right = 0;
        if (e.code === 'Space') keys.jump = false;
    });

    // Parameters
    const parameters =
    {
        speed: 2,
        jumpSpeed: 4,
        xSensibility: 0.003,
        ySensibility: 0.003
    }

    // Moves
    window.addRenderListener(() =>
    {
        let wishDir = new THREE.Vector3(keys.right, 0, -keys.forward);
        if (wishDir.lengthSq() > 0.0001) wishDir.normalize();

        // transform wishDir by camera y rotation if you want camera-relative movement:
        wishDir.applyAxisAngle(new THREE.Vector3(0,1,0), window.mainCamera.rotation.y);

        const curVel = body.linvel();
        const curVy = curVel.y;
        // curVel.free(); 

        let newVy = curVy;
        if (keys.jump && true)
        {
            newVy = parameters.jumpSpeed;
        }

        body.setTranslation(new RAPIER.Vector3(body.translation().x, body.translation().y+0.001, body.translation().z))
        body.setLinvel({ x: wishDir.x * parameters.speed, y: newVy, z: wishDir.z * parameters.speed }, true);

        window.mainCamera.position.set(body.translation().x, body.translation().y+0.9, body.translation().z)

        // Graphic Sync
        // const pos = body.translation();
        // playerMesh.position.set(pos.x, pos.y, pos.z);

        // const rot = body.rotation();
        // playerMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    })

    window.debug.setPlayerPos = (x,y,z) => { body.setTranslation(new RAPIER.Vector3(x,y,z), true); body.setLinvel(new RAPIER.Vector3(0,0,0)) }

    // Camera
    window.canvas.addEventListener("click", window.canvas.requestPointerLock)
    window.canvas.requestPointerLock();

    let lastMousePosition = null;
    let pitch = 0;
    let yaw = 0;
    document.addEventListener("mousemove", (ev) =>
    {
        if (document.pointerLockElement != canvas){return}

        if(!lastMousePosition){lastMousePosition={x:ev.clientX, y:ev.clientY}; return}

        pitch -= ev.movementY*parameters.ySensibility
        yaw -= ev.movementX*parameters.xSensibility

        window.mainCamera.rotation.set(pitch, yaw, 0, 'YXZ'); 
        
        lastMousePosition={x:ev.clientX, y:ev.clientY};
    })
}