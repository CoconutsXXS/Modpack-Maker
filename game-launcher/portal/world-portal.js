import World from "../world/world";
import Portal from "./portal";
import * as THREE from "three";

export default class WorldPortal
{
    jarContent
    world
    portal
    scene
    translate = {x: 1000, y: 1000, z: 1000}

    constructor(jarContent, world, x, y, z, sx, sy)
    {
        this.world = new World(jarContent, '/Users/coconuts/Library/Application Support/Modpack Maker/instances/'+jarContent.name+'/minecraft', window.addRenderListener, null, false);
        this.world.world = world
        this.world.group.position.add(this.translate)

        this.scene = new THREE.Scene();
        this.scene.add( new THREE.AmbientLight(0xffffff, Math.pow(15/15, 1.5)*2) )
        this.scene.add(this.world.group)

        const sky = new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000), new THREE.MeshBasicMaterial({side: THREE.BackSide, color: 0x000000}))
        sky.position.add(this.translate)
        this.scene.add(sky)

        this.portal = new Portal(sx, sy, x, y, z, new THREE.Vector3(), new THREE.Vector3(), sky, this.scene)
        this.world.camera = this.portal.camera
        this.portal.shiftPosition.setY(-sy/2+1.62)
    }

    async loadWorld(distance = 14)
    {
        const level = await this.world.loadLevel()

        this.world.dimension = level.Player.Dimension

        this.portal.initPosition = new THREE.Vector3(level.Player.Pos[0]-.5, level.Player.Pos[1]+1.62 -.5, level.Player.Pos[2] -.5).add(this.translate)
        this.portal.initRotation = new THREE.Vector3(THREE.MathUtils.degToRad(-level.Player.Rotation[1]), normalizeAngle(THREE.MathUtils.degToRad(-level.Player.Rotation[0]-180)), 0)

        this.portal.fov = 70

        // Gen
        const camPos = this.portal.initPosition.clone().sub(this.translate);
        const cameraDir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(this.portal.initRotation.x, this.portal.initRotation.y, this.portal.initRotation.z))

        const startPoint = {x: Math.floor(camPos.x/16), z: Math.floor(camPos.z/16)}

        const toLoad = []
        for (let x = Math.floor(camPos.x/16)-distance; x < Math.floor(camPos.x/16)+distance; x++)
        {
            for (let z = Math.floor(camPos.z/16)-distance; z < Math.floor(camPos.z/16)+distance; z++)
            {
                // Culling
                if(cameraDir.angleTo( new THREE.Vector3(x*15, camPos.y, z*15).sub(camPos).normalize() ) < Math.PI/2 &&
                    cameraDir.angleTo( new THREE.Vector3(x*16, camPos.y, z*16).sub(camPos).normalize() ) < Math.PI/2 &&
                    cameraDir.angleTo( new THREE.Vector3(x*15, camPos.y, z*16).sub(camPos).normalize() ) < Math.PI/2 &&
                    cameraDir.angleTo( new THREE.Vector3(x*16, camPos.y, z*15).sub(camPos).normalize() ) < Math.PI/2)
                {continue}

                toLoad.push({x,z})
            }
        }

        for(let l of toLoad.sort((a, b) => (Math.abs(startPoint.x-a.x)+Math.abs(startPoint.z-a.z)) - (Math.abs(startPoint.x-b.x)+Math.abs(startPoint.z-b.z))))
        {
            await this.world.loadChunk(l.x, l.z)
        }
    }
}

function normalizeAngle(angle)
{
    angle = angle % (2 * Math.PI);
    if (angle > Math.PI) angle -= 2 * Math.PI;
    if (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}