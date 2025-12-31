import JavaTree from "./java-tree";
import getClassData from "./class-data"
import logTree from "./log-tree";

export default async function searchEntities(sourceJar)
{
    const script = (await sourceJar.getFile(['net', 'minecraft', 'world', 'entity', 'EntityType.class'])).value;

    console.log(await registrationSearch(script, sourceJar))
}

export async function registrationSearch(script, sourceJar)
{
    if(!script.text.includes("import net.minecraft.world.entity.EntityType;"))
    { return []; }

    const list = []

    await script.loadDependencies(sourceJar)

    // Vanilla
    script.walk((c) =>
    {
        if(c.type == "method_invocation" && c.get("identifier", 0).content == "EntityType" && c.get("identifier", 1).content == "register" && c.get("argument_list"))
        {
            const id = c.get("argument_list").content[0]?.get("string_fragment").content
            const builder = c.get("argument_list").content[1]

            let builderOfFunction = null
            builder.walk((c, k, end) =>
            {
                if(c.get("identifier", 0)?.content == "Builder" && c.get("identifier", 1)?.content)
                {
                    end()
                    builderOfFunction = c;
                }
            })
            
            const constructorName = builderOfFunction?.get("argument_list")?.content[0]?.get("identifier")?.content;
            const category = builderOfFunction?.get("argument_list")?.content[1]?.get("field_access")?.totalContent;

            let constructor = null;
            if(constructorName)
            {
                script.content.forEach(c =>
                {
                    if(c.type == "import_declaration" && c.get("scoped_identifier")?.get("identifier")?.content == constructorName)
                    {
                        constructor = c.get("scoped_identifier").totalContent;
                    }
                })
                if(!constructor) { constructor = constructorName; }
            }

            list.push
            ({
                id,
                constructor,
                category
            })
        }
    })

    return list
}

window.searchEntities = searchEntities;