import * as fs from 'fs/promises';
import * as pathlib from 'path';
import _ from 'lodash';
import * as fs_extra from 'fs-extra'
import * as micromatch from 'micromatch';
import { default as memoize } from 'memoizee';
import { fullPath, readAllFiles, readDirFiles, serializeGenParams, writeDebug } from './tools';
import { hashElement } from 'folder-hash'
import { BalancerType, createBalancer } from './balancers/balancecreator';
import { loadParams } from './config';
import { PathContextBalancer } from './balancers/pathcontext';
import { BuffOrNerf } from './balancers/balancer';
const modName = "GENERATED_MOD"

const mmAny = memoize((str: string, blacklist: string[]) => {
    if (blacklist) {
        return micromatch.any(str, blacklist);
    }
    return true;
}, { primitive: true });
function getAssignmentsOfMatchStatus(debug_allprops: {
    value: number,
    key: string,
    matched: boolean,
    context: string[]
}[], matched: boolean): { [key: string]: number[] } {
    const groupedValues = Object.groupBy(debug_allprops.filter(x => x.matched === matched), x => x.key);
    //values contains props grouped by key
    const out: { [key: string]: number[] } = {}
    for (const key in groupedValues) {
        if (groupedValues[key] !== undefined) {
            out[key] = groupedValues[key]!.map(x => x.value)
        }
    }
    return out;
}
async function main() {
    const genparams = await loadParams();

    const rp = _.uniq(_.flatten(genparams.selectedMods.map(x => x.replacePaths)))

    let modFolder = pathlib.join(genparams.derived.gameDocumentsPath, `mod/${modName}`);
    fs_extra.ensureDirSync(modFolder)
    fs_extra.emptyDirSync(modFolder)
    const fileMap: { [key: string]: fullPath } = {}
    console.log("Enumerating files...")
    for (const dir of genparams.includeDirs) {
        if (rp.indexOf(dir) !== -1) {
            continue;
        }
        const fullPath = pathlib.join(genparams.derived.steamGamePath, dir)
        const allFiles = readDirFiles(fullPath, dir)
        for (const file of allFiles) {
            fileMap[file.relative] = file.fullpath
        }
    }
    console.log("Performing copies...")
    for (const mod of genparams.selectedMods) {
        for (const dir of genparams.includeDirs) {
            const fullPath = pathlib.join(mod.value, dir);
            if (fs_extra.existsSync(fullPath)) {
                const allFiles = readDirFiles(fullPath, dir)
                for (const file of allFiles) {
                    fileMap[file.relative] = file.fullpath
                }
            }
        }
        console.log(`Copying mod "${mod.name}"...`)
        await fs.cp(mod.value, modFolder, { recursive: true });//copy base mod over
    }
    const modifierRegex = /((?:cost|upkeep|build_cost_resources|modifier)\s*=\s*{[^}]*}|(\w*)\s*=\s*(\-?\d+[.,]\d+|\-?\d+)\s*?)/gim
    const openBracketsRegex = /(\w*)[\s=]*{/i;
    const closeBracketsRegex = /}/i;

    let allAssignments: {
        value: number,
        key: string,
        matched: boolean,
        context: string[]
    }[] = []
    let debug_contents: string[] = [];
    console.log("Reading files...")
    const fileContents = await readAllFiles(Object.values(fileMap));
    const relativePaths = Object.keys(fileMap);
    const fileContentContent = Object.values(fileContents)

    console.log("Generating balance...")
    const balancer = createBalancer(genparams.balancing)
    for (let i = 0; i < fileContentContent.length; i++) {
        let content = fileContentContent[i]

        const lines = content.split('\n');
        const pathContext = [relativePaths[i]]
        for (const [i, line] of lines.entries()) {
            if (line.startsWith('#')) { continue; }
            if (openBracketsRegex.test(line)) {
                //push the 1st capture group to pathContext
                pathContext.push(openBracketsRegex.exec(line)![1])
            }
            if (closeBracketsRegex.test(line)) {
                pathContext.pop()
            }
            const newline = line.replace(modifierRegex, ((match, p1, propertyName, propertyValueString, offset, string) => {
                if (!propertyName) return match;
                let propObj = {
                    value: parseFloat(propertyValueString),
                    key: propertyName,
                    matched: false,
                    context: JSON.parse(JSON.stringify(pathContext))
                };
                if (!isNaN(Number(propertyValueString)) && !mmAny(propertyName, genparams.blacklist)) {
                    propObj.value = parseFloat(propertyValueString);
                    propObj.matched = true;
                }
                allAssignments.push(propObj)
                return match;
            }));
            lines[i] = newline;
        }
    }
    const possibleValues: { [key: string]: number[] } = getAssignmentsOfMatchStatus(allAssignments, true)
    console.log("Finished initial parse.")
    for (let i = 0; i < fileContentContent.length; i++) {
        let content = fileContentContent[i]
        let pathRelative = relativePaths[i];
        let matchesAny = false;
        debug_contents.push(`##### ${pathRelative}\n\n\n` + content);
        const lines = content.split('\n');
        const pathContext = [pathRelative]
        for (const [i, line] of lines.entries()) {
            if (line.startsWith('#')) { continue; }
            if (openBracketsRegex.test(line)) {
                //push the 1st capture group to pathContext
                pathContext.push(openBracketsRegex.exec(line)![1])
            }
            if (closeBracketsRegex.test(line)) {
                pathContext.pop()
            }
            const newline = line.replace(modifierRegex, ((match, p1, propertyName, propertyValueString, offset, string) => {
                if (!propertyName) return match;
                if (!isNaN(Number(propertyValueString)) && !mmAny(propertyName, genparams.blacklist)) {
                    if (!possibleValues[propertyName]) {
                        return match;
                    }
                    matchesAny = true;
                    return balancer.balance( propertyName, propertyValueString, possibleValues[propertyName],pathContext);
                } else {
                    return match;
                }
            }));
            lines[i] = newline;
        }

        if (matchesAny) {
            let pathCleaned = pathRelative.replace(/^game[\\\/]common[\\\/]/igm, 'common\\');
            let componentPath = pathlib.join(modFolder, pathCleaned)
            //console.log(`Component path will be written: ${componentPath}`)
            await fs.mkdir(pathlib.dirname(componentPath), { recursive: true })
            await fs.writeFile(componentPath, lines.join('\n'), {
                encoding: 'utf8'
            })
        } else {
            //console.log('No usable modifiers found, skipping');
        }
    }
    let debug_allprops_grouped = getAssignmentsOfMatchStatus(allAssignments, false)
    let debug_matchedProps = getAssignmentsOfMatchStatus(allAssignments, true)
    writeDebug('props_all_' + genparams.chosenGame + '.csv', Object.keys(debug_allprops_grouped).map(x => x + ',' + Array.from(debug_allprops_grouped[x].values()).join(",")).join('\n'))
    writeDebug('props_matched_' + genparams.chosenGame + '.csv', Object.keys(debug_matchedProps).map(x => x + ',' + Array.from(debug_matchedProps[x].values()).join(",")).join('\n'))
    writeDebug('content_' + genparams.chosenGame + '.txt', debug_contents.join('\n\n\n\n\n\n'))

    const assignmentsOfKey = Object.groupBy(allAssignments.filter(x => x.matched), x => x.key)
    const propertyAssignmentStr = []
    for (const key in assignmentsOfKey) {
        if (assignmentsOfKey[key] !== undefined) {
            for (const assignment of assignmentsOfKey[key]!) {
                propertyAssignmentStr.push(`${key},${assignment.value},${assignment.context.join(',')}`)
            }
        }
    }
    writeDebug('property_assignments.csv', propertyAssignmentStr.join('\n'))

    const rpString = rp.map(x => `replace_path="${x}"`).join('\n')
    await fs.writeFile(pathlib.join(modFolder, '/descriptor.mod'), `
version="1.0.0"
tags={
    "Gameplay"
}
${rpString}
name="${modName}"
supported_version="*"
`)
    await fs.writeFile(pathlib.join(genparams.derived.gameDocumentsPath, `mod/${modName}.mod`), `
version="1.0.0"
tags={
    "Gameplay"
}
${rpString}
name="${modName}"
supported_version="*"
path=mod/${modName}
`)
    const hashData = await hashElement(modFolder, {
        encoding: 'hex'

    })
    const hash = hashData.hash
    if(genparams.balancing.balancer === BalancerType.pathContext){
        let keyResults = []
        const balancerPath = balancer as PathContextBalancer;
        for(const balanceKey of Object.keys(balancerPath.values)){
            const value = balancerPath.values[balanceKey];
            const buffState = balancerPath.getBuffOrNerf(value);
            if (buffState == BuffOrNerf.Buff){
                keyResults.push("Buffing " +balanceKey );
            }else if(buffState == BuffOrNerf.Nerf){
                keyResults.push("Nerfing " +balanceKey );
            }
        }
        writeDebug('pathContextResults.txt', keyResults.join("\n"))
    }
    writeDebug('allFiles.csv', balancer.getAll().join("\n"))
    writeDebug('interestingFiles.csv', balancer.getInteresting().join("\n"))
    console.log('')
    console.log('')
    console.log(`Wrote mod to ${modFolder}`)
    console.log("List of interesting touched files is available in the debug folder");
    console.log('')
    if (!genparams.derived.imported) {
        console.log(`To share this mod configuration, give this code to your friends:`);
        console.log(`${serializeGenParams(genparams)}`)
    }
    console.log('')
    console.log("SHA1 HASH1:  " + hash)
}
main();