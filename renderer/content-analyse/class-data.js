export default async function getClassData(tree, script)
{
    let packageName = ""
    let result = []

    function walk(node)
    {
        if (!node) return;

        // Package
        if(node.type == "package_declaration")
        {
            // scoped_identifier
            const packageNode = node.childForFieldName("scoped_identifier");
            packageName = packageNode ? script.slice(packageNode.startIndex, packageNode.endIndex) : null;
        }

        // Class
        if (node.type === "class_declaration")
        {
            const nameNode = node.childForFieldName("identifier");
            const className = nameNode ? script.slice(nameNode.startIndex, nameNode.endIndex) : null;

            const superNode = node.childForFieldName("superclass")?.childForFieldName("type_identifier");
            const superClassName = superNode ? script.slice(superNode.startIndex, superNode.endIndex).trim() : null;

            result.push({ className, extends: superClassName });
        }

        for (let i = 0; i < node.namedChildCount; i++)
        {
            walk(node.namedChild(i));
        }
    }

    walk(tree.rootNode);

    return result;
}