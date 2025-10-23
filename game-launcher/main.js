import { initializeScene } from "./renderer"
import { ModpackJar } from './jar-data'
import { parseModel, parseNbt } from "./model-loader"

import * as THREE from "three";

async function main()
{
    await initializeScene()

    window.jar = await ModpackJar.get("Apocalypse");
    console.log(window.jar)

    window.scene.add( await parseNbt("minecraft:structures/ancient_city/city/entrance/entrance_connector", window.jar, true) )
    window.scene.add( new THREE.AmbientLight(0xffffff, 1) )
}

main()