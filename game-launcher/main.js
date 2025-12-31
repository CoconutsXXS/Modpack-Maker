import { initializeScene } from "./renderer"
import JarContent from '../renderer/content-analyse/jar-content'
import World from "./world/world"
import { Player } from "./player/controller"

import * as THREE from "three";
import Portal from "./portal/portal";
import WorldPortal from "./portal/world-portal";
import GUI from "./player/gui";
import Extension from "./extension";
import Item from "./world/item";
import Block from "./world/block";

async function main()
{
    await initializeScene()

    window.jar = await JarContent.get("test");

    // console.log(await window.jar.get("assets/minecraft/textures/item/howl_pottery_sherd_n.png"))

    // Load Extension
    window.jar = await Extension.load('modpack-maker', window.jar);

    console.log(window.jar)

    const testItem = await Item.from('minecraft:oak_stairs', window.jar)
    console.log(testItem)
    console.log(testItem.block)
    console.log(await Block.from(testItem.block, {}, window.jar))
    // return


    // Hub Scene
    // Light
    window.scene.add( new THREE.AmbientLight(0xffffff, Math.pow(12/15, 1.5)*2) )
    const light = new THREE.DirectionalLight(0xffffff, Math.pow(1, 1.5)*2);
    light.castShadow = true;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 100;
    light.shadow.camera.right = 50;
    light.shadow.camera.left = -50;
    light.shadow.camera.top	= 50;
    light.shadow.camera.bottom = -50;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    light.shadow.bias = -0.02
    light.position.set(50, 100, 50);
    light.target = window.mainCamera
    window.scene.add(light)

    window.addRenderListener(() =>
    {
        light.position.set(window.mainCamera.position.x + 30, window.mainCamera.position.y + 50, window.mainCamera.position.z + 30);
    })

    const structures = Object.keys(window.jar.indexer).filter(a=>a.split("/")[2] == 'structures')

    let launchWorld = window.mcWorld = new World(window.jar, '/Users/coconuts/Library/Application Support/Modpack Maker/instances/test/minecraft', window.addRenderListener)
    window.scene.add(launchWorld.group)

    // structures[Math.floor(Math.random() * structures.length)]
    await launchWorld.importStructure('minecraft:structures/ancient_city/city/entrance/entrance_connector', 0, 0, 0);

    // Player
    window.player = new Player(8, 4, 9)
    window.canvas.requestPointerLock();

    // const blocks = Object.keys(window.jar.assets).filter(a=>a.split(":")[1].startsWith('blockstates'))
    // for (let i = 0; i < 9; i++)
    // {
    //     const id = blocks[Math.floor(Math.random() * blocks.length)];
    //     window.player.gui.setSlot(i, id.split(':')[0]+':'+id.split(':')[1].slice(id.split(':')[1].indexOf('/')+1))
    // }


    // Portal
    const worldPortal = new WorldPortal(window.jar, 'New World 1_20_1', 8, 2, 8, 2, 3)
    worldPortal.loadWorld(16)

    const l = await worldPortal.world.loadLevel()
    for (let i = 0; i < 9; i++)
    {
        const id = l.Player.Inventory.find(s=>s.Slot==i)?.id;
        // await window.player.gui.setSlot(i, id)
    }

    // await window.player.gui.setSlot(6, 'modpack-maker:launcher-terminal')

    // return

    const i = await launch("test",
        {
            log: (t, c) =>
            {
            },
            close: c =>
            {
            },
            processLaunch: () =>
            {
            },
            network: (i, c) =>
            {
            },
            windowOpen: async (w, i) =>
            {
                // Stream
                const stream = await navigator.mediaDevices.getUserMedia
                ({
                    audio: false,
                    video:
                    {
                        mandatory:
                        {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: w.id
                        },
                        maxWidth: 1920*2,
                        maxHeight: 1080*2,
                        maxFrameRate: 120,
                        minWidth: 1920/5,
                        minHeight: 1080/5,
                    }
                });
                const video = document.createElement('video');
                video.srcObject = stream;
                video.muted = true;
                video.onloadedmetadata = () =>
                {
                    video.play()
                    worldPortal.portal.project(video, worldPortal.world.group.children)
                }
            },
        },
        {type: "singleplayer", identifier: "New World 1_20_1"},
        window.innerWidth,
        window.innerHeight
    )

    return

    // // Portal
    // if(false)
    // {
    //     let mcWorld = window.mcWorld = new World(window.jar, '/Users/coconuts/Library/Application Support/Modpack Maker/instances/test/minecraft', window.addRenderListener, null, false)
    //     mcWorld.world = 'New World 1_20_1'
    //     mcWorld.group.position.setY(-3000)
    //     window.scene.add(mcWorld.group)

    //     const level = await window.mcWorld.loadLevel()

    //     const sky = new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000), new THREE.MeshBasicMaterial({side: THREE.BackSide, color: 0x000000}))
    //     sky.position.set(level.Player.Pos[0]-.5, level.Player.Pos[1]+1.62 -3000 -.5, level.Player.Pos[2] -.5)
    //     window.scene.add(sky)

    //     const p = new Portal(2, 3, 8, 2, 8, new THREE.Vector3(level.Player.Pos[0]-.5, level.Player.Pos[1]+1.62 -3000 -.5, level.Player.Pos[2] -.5), new THREE.Vector3(THREE.MathUtils.degToRad(-level.Player.Rotation[1]), THREE.MathUtils.degToRad(-level.Player.Rotation[0]-180), 0), sky, window.scene)
    //     mcWorld.camera = p.camera
    //     p.fov = 70
    //     p.shiftPosition.setY(1.5-1.62)

    //     setTimeout(loadNearby, 1000)
    //     async function loadNearby(renderDistance = 14)
    //     {
    //         const startPoint = {x: Math.floor(p.camera.position.x/16), z: Math.floor(p.camera.position.z/16)}
    //         const toLoad = []
    //         for (let x = Math.floor(p.camera.position.x/16)-renderDistance; x < Math.floor(p.camera.position.x/16)+renderDistance; x++)
    //         {
    //             for (let z = Math.floor(p.camera.position.z/16)-renderDistance; z < Math.floor(p.camera.position.z/16)+renderDistance; z++)
    //             {
    //                 toLoad.push({x,z})
    //             }
    //         }

    //         for(let l of toLoad.sort((a, b) => (Math.abs(startPoint.x-a.x)+Math.abs(startPoint.z-a.z)) - (Math.abs(startPoint.x-b.x)+Math.abs(startPoint.z-b.z))))
    //         {
    //             await mcWorld.loadChunk(l.x, l.z)
    //         }
    //     }

    //     // Launch
    //     if(false)
    //     {
    //         const i = await launch("test",
    //             {
    //                 log: (t, c) =>
    //                 {
    //                 },
    //                 close: c =>
    //                 {
    //                 },
    //                 processLaunch: () =>
    //                 {
    //                 },
    //                 network: (i, c) =>
    //                 {
    //                 },
    //                 windowOpen: async (w, i) =>
    //                 {
    //                     // Stream
    //                     const stream = await navigator.mediaDevices.getUserMedia
    //                     ({
    //                         audio: false,
    //                         video:
    //                         {
    //                             mandatory:
    //                             {
    //                                 chromeMediaSource: 'desktop',
    //                                 chromeMediaSourceId: w.id
    //                             },

    //                             maxWidth: 1920*2,
    //                             maxHeight: 1080*2,

    //                             maxFrameRate: 120,

    //                             minWidth: 1920/5,
    //                             minHeight: 1080/5,
    //                         }
    //                     });

    //                     const video = document.createElement('video');
    //                     document.body.appendChild(video)
    //                     video.srcObject = stream;
    //                     video.muted = true;
    //                     video.onloadedmetadata = () =>
    //                     {
    //                         video.play()
    //                         p.project(video, mcWorld.group.children)
    //                     }
    //                 },
    //             },
    //             {type: "singleplayer", identifier: "New World 1_20_1"},
    //             window.innerWidth,
    //             window.innerHeight
    //         )
    //     }
    // }

    // Portal    
    const renderTarget = new THREE.WebGLRenderTarget(512, 512,
    {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
        format: THREE.RGBAFormat,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping
    });

    // Camera
    const copyCam = new THREE.PerspectiveCamera();
    copyCam.fov = window.mainCamera.fov;
    copyCam.aspect = window.mainCamera.aspect;

    // Material
    const portalMat = new THREE.MeshBasicMaterial
    ({
        map: renderTarget.texture,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    portalMat.onBeforeCompile = (shader) =>
    {
        shader.uniforms.uTexture = { value: renderTarget.texture };

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

        portalMat.userData.shader = shader;
    };

    // Mesh
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), portalMat);
    plane.renderOrder = 9999;
    plane.position.set(40.5, 66, 40.5)
    window.scene.add(plane);

    const aabb = new THREE.Box3(new THREE.Vector3(plane.position.x-1, plane.position.y-1.5, plane.position.z-1), new THREE.Vector3(plane.position.x+1, plane.position.y+1.5, plane.position.z+1))

    // Render
    const initPosition = new THREE.Vector3(level.Player.Pos[0], level.Player.Pos[1]+1.7, level.Player.Pos[2])
    const initRotation = new THREE.Vector3(THREE.MathUtils.degToRad(level.Player.Rotation[1]), THREE.MathUtils.degToRad(level.Player.Rotation[0]), 0)

    function normalizeAngle(angle)
    {
        angle = angle % (2 * Math.PI);
        if (angle > Math.PI) angle -= 2 * Math.PI;
        if (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    // setupPlayer(40, 70, 40)

    window.addRenderListener((clock, frustum) =>
    {
        if(!frustum.intersectsBox(aabb)){return}

        // Transform
        const distance = Math.max(0, Math.min(window.mainCamera.position.distanceTo(plane.position)/2 - .2, 1));

        copyCam.position.set(initPosition.x, initPosition.y-2000, initPosition.z)

        const additive = new THREE.Vector3(
            (window.mainCamera.position.x-plane.position.x) * distance,
            (window.mainCamera.position.y-plane.position.y) * distance,
            (window.mainCamera.position.z-plane.position.z) * distance
        )
        additive.applyEuler(new THREE.Euler(initRotation.x-plane.rotation.x, initRotation.y-plane.rotation.y, initRotation.z-plane.rotation.z))
        copyCam.position.add(additive)
        copyCam.rotation.set(normalizeAngle(window.mainCamera.rotation.x) *distance + initRotation.x-plane.rotation.x,
            normalizeAngle(window.mainCamera.rotation.y) *distance + initRotation.y-plane.rotation.y,
            normalizeAngle(window.mainCamera.rotation.z) *distance + initRotation.z-plane.rotation.z,
            'YXZ'
        )


        // Resize
        copyCam.aspect = renderTarget.width / renderTarget.height;
        copyCam.updateProjectionMatrix();

        renderTarget.setSize(Math.floor(window.innerWidth * window.renderer.getPixelRatio()), Math.floor(window.innerHeight * window.renderer.getPixelRatio()));

        // Render
        window.renderer.setRenderTarget(renderTarget);
        renderer.clearColor();
        renderer.clearDepth();
        renderer.clear(true, true, true);
        window.renderer.render( window.scene, copyCam )

        if(portalMat.userData.shader) { portalMat.userData.shader.uniforms.uTexture.value = renderTarget.texture }

        window.renderer.setRenderTarget(null);
    }, true)

    // Load
    setTimeout(loadNearby, 3000)


    // Tests

    // {
    //     let bm = await Block.from("minecraft:dirt", {}, window.jar);
    //     console.log(bm)

    //     const mesh = bm.instanceMesh(8);
    //     const dummy = new THREE.Object3D();

    //     for (let i = 0; i < 8; i++)
    //     {
    //         dummy.position.set(i*2,0,0);
    //         dummy.updateMatrix();
    //         mesh.setMatrixAt(i, dummy.matrix);
    //     }

    //     const masks = new Float32Array
    //     ([
    //         Block.computeInstanceMask([1,1,1,1,1,1]),
    //         Block.computeInstanceMask([0,1,1,1,1,1]),
    //         Block.computeInstanceMask([1,0,1,1,1,1]),
    //         Block.computeInstanceMask([1,1,0,1,1,1]),
    //         Block.computeInstanceMask([1,1,1,0,1,1]),
    //         Block.computeInstanceMask([1,1,1,1,0,1]),
    //         Block.computeInstanceMask([1,1,1,1,1,0]),
    //         Block.computeInstanceMask([0,0,0,0,0,0]),
    //     ]);

    //     mesh.geometry.setAttribute('instanceMask', new THREE.InstancedBufferAttribute(masks, 1, false));
    //     window.scene.add(mesh);

    //     return
    // }

    // '/Users/coconuts/Library/Application Support/Modpack Maker/instances/test/minecraft/saves/New World 1_20_1'
    // let world = window.mcWorld = new World(window.jar, '/Users/coconuts/Library/Application Support/Modpack Maker/instances/test/minecraft', window.addRenderListener, true)
    // world.world = 'New World 1_20_1'

    // console.log(await world.loadChunk(0, 0))
    // console.log(world)
    // return

    // window.scene.add(world.group)

    // window.debug.freeCamera(async (intersects) =>
    // {
    //     if(!window.mouseLeftPressed || !window.ctrlKey){return}

    //     await world.placeBlock(Math.round(intersects.point.x), Math.round(intersects.point.y), Math.round(intersects.point.z), 'minecraft:dirt')
    // })

    // for (let x = -1; x < 16; x++)
    // {
    //     for (let y = -1; y < 16; y++)
    //     {
    //         for (let z = -1; z < 16; z++)
    //         {
    //             await world.placeBlock(x, y, z, 'minecraft:air')
    //         }
    //     }
    // }
    // for (let x = 0; x < 8; x++)
    // {
    //     for (let y = 0; y < 8; y++)
    //     {
    //         for (let z = 0; z < 8; z++)
    //         {
    //             await world.placeBlock(x, y, z, 'minecraft:dirt')
    //         }
    //     }
    // }
    // for (let x = 1; x < 3; x++)
    // {
    //     for (let y = 2; y < 3; y++)
    //     {
    //         for (let z = 2; z < 3; z++)
    //         {
    //             await world.placeBlock(x, y, z, 'minecraft:air')
    //         }
    //     }
    // }

    // console.log(world)
    // return;

    // const level = await world.loadLevel()
    // window.mainCamera.position.set(level.Player.Pos[0], level.Player.Pos[1]+1.7, level.Player.Pos[2])
    // window.mainCamera.rotation.set(THREE.MathUtils.degToRad(level.Player.Rotation[1]), THREE.MathUtils.degToRad(level.Player.Rotation[0]), 0, 'YXZ'); 

    // window.scene.add(world.group)

    // console.log(world)
    // window.debug.freeCamera()

    // await world.importStructure("minecraft:structures/ancient_city/city/entrance/entrance_connector", 0, 0, 0)

    // const renderDistance = 8
    // const startPoint = {x: Math.floor(window.mainCamera.position.x/16), z: Math.floor(window.mainCamera.position.z/16)}
    // const toLoad = []
    // for (let x = Math.floor(window.mainCamera.position.x/16)-renderDistance; x < Math.floor(window.mainCamera.position.x/16)+renderDistance; x++)
    // {
    //     for (let z = Math.floor(window.mainCamera.position.z/16)-renderDistance; z < Math.floor(window.mainCamera.position.z/16)+renderDistance; z++)
    //     {
    //         toLoad.push({x,z})
    //     }
    // }
    // for(let l of toLoad.sort((a, b) => (Math.abs(startPoint.x-a.x)+Math.abs(startPoint.z-a.z)) - (Math.abs(startPoint.x-b.x)+Math.abs(startPoint.z-b.z))))
    // {
    //     await world.loadChunk(l.x, l.z)
    // }


    // setupPlayer(8, 128, 8)

    // return

    // await parseMca("/Users/coconuts/Library/Application Support/Modpack Maker/instances/test/minecraft/saves/My World!/region/r.0.0.mca", {x:0, y:0}, {x:3, y:3}, window.jar, true)
    // setupPlayer(8, 128, 8)
    // return

    // {
    //     let ogB = await Block.from("minecraft:block/grass_block", {}, window.jar)
    //     let blocks = []

    //     console.log(ogB)

    //     for (let x = 0; x < 16; x++)
    //     {
    //         for (let y = 0; y < 16; y++)
    //         {
    //             for (let z = 0; z < 16; z++)
    //             {
    //                 var b = ogB.clone()
    //                 blocks.push(b)
    //                 b.position = {x,y,z}
    //                 b.add()
    //             }

    //         }
    //     }

    //     for(let b of blocks)
    //     {
    //         b.computeSides(blocks)
    //     }

    //     window.debug.freeCamera((intersects) =>
    //     {
    //         if(!window.mouseLeftPressed || !window.ctrlKey){return}
    //         for ( let i = 0; i < intersects.length; i ++ )
    //         {
    //             let b = blocks.find(b=>b.position.x==intersects[i].object.position.x && b.position.y==intersects[i].object.position.y && b.position.z==intersects[i].object.position.z);
    //             if(!b || !b.graphic.parent){continue}
    //             b.remove()

    //             for(let n of b.getDirectNeighboors(blocks))
    //             {
    //                 if(!n){continue}
    //                 n.computeSides(blocks)
    //             }
    //             break;
    //         }
    //     })

    //     return
    // }
    
    // setupPlayer()

    // window.debug.enabledPhysicView()
    // window.debug.freeCamera()

}

main()