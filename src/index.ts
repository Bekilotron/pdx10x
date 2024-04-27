import * as fs from 'fs-extra';
import * as pathlib from 'path';
import * as _ from 'lodash'
import * as micromatch from 'micromatch';
import { default as memoize } from 'memoizee';
import { fullPath, readAllFiles, readDirFiles, serializeGenParams, writeDebug } from './tools';
import {hashElement} from 'folder-hash'
import { BalancerType, createBalancer } from './balancers/balancecreator';
import { loadParams } from './config';
const modName = "GENERATED_MOD"

const mmAny = memoize((str: string, blacklist: string[]) => {
    if (blacklist) {
        return micromatch.any(str, blacklist);
    }
    return true;
}, { primitive: true });

async function main() {
    const genparams = await loadParams();

    const rp = _.uniq(_.flatten(genparams.selectedMods.map(x => x.replacePaths)))

    let finalMod = pathlib.join(genparams.derived.gameDocumentsPath, `mod/${modName}`);
    fs.ensureDirSync(finalMod)
    fs.emptyDirSync(finalMod)
    const fileMap: { [key: string]: fullPath } = {}
    console.log("Enumerating files & performing copies...")
    for (const dir of genparams.includeDirs) {
        if (rp.indexOf(dir) !== -1) {
            continue;
        }
        const fullPath = pathlib.join(genparams.derived.steamGamePath, dir)
        const allFiles = readDirFiles(fullPath,dir)
        for (const file of allFiles) {
            fileMap[file.relative] = file.fullpath
        }
    }
    for (const mod of genparams.selectedMods) {
        for (const dir of genparams.includeDirs) {
            const fullPath = pathlib.join(mod.value, dir);
            if (fs.existsSync(fullPath)) {
                const allFiles = readDirFiles(fullPath,dir)
                for (const file of allFiles) {
                    fileMap[file.relative] = file.fullpath
                }
            }
        }
        await fs.copy(mod.value, finalMod);//copy base mod over
    }
    const modifierRegex = /((?:cost|upkeep|build_cost_resources|modifier)\s*=\s*{[^}]*}|(\w*)\s*=\s*(\-?\d+[.,]\d+|\-?\d+)\s*?)/gim

    let debug_allprops: { [key: string]: string[] } = {}
    let debug_matchedProps: {
        [key: string]: {
            key: string,
            values: string[]
        }
    } = {}
    let debug_contents: string[] = [];
    console.log("Reading files...")
    const fileContents = await readAllFiles(Object.values(fileMap));
    const relativePaths = Object.keys(fileMap);
    const fileContentContent = Object.values(fileContents)

    console.log("Generating balance...")
    const balancer = createBalancer(BalancerType.random, genparams.balancing)
    const possibleValues: {[key: string]: number[]} = {}
    for (let i = 0; i < fileContentContent.length; i++) {
        let content = fileContentContent[i]
        content.replace(modifierRegex, ((match, p1, p2, p3, offset, string) => {
            if (!p2) return match;
            if (debug_allprops[p2] === undefined) {
                debug_allprops[p2] = []
            }
            debug_allprops[p2].push(p3);
            if (!isNaN(Number(p3)) && !mmAny(p2, genparams.blacklist)) {
                if (debug_matchedProps[p2] === undefined) {
                    debug_matchedProps[p2] = { key: p2, values: [] }
                }
                if (possibleValues[p2] === undefined) {
                    possibleValues[p2] = []
                }
                debug_matchedProps[p2].values.push(p3);
                possibleValues[p2].push(parseFloat(p3));
            }
            return match;
        }))
    }
    console.log("Finished initial parse.")
    for (let i = 0; i < fileContentContent.length; i++) {
        let content = fileContentContent[i]
        let pathRelative = relativePaths[i];
        let matchesAny = false;
        debug_contents.push(`##### ${pathRelative}\n\n\n` + content);
        content = content.replace(modifierRegex, ((match, p1, p2, p3, offset, string) => {
            if (!p2) return match;
            if (!isNaN(Number(p3)) && !mmAny(p2, genparams.blacklist)) {
                if(!debug_matchedProps[p2]){
                    return match;
                }
                matchesAny = true;
                return balancer.balance(pathRelative, p2, p3, possibleValues[p2]);
            } else {
                return match;
            }
        }))
        if (matchesAny) {
            let pathCleaned = pathRelative.replace(/^game[\\\/]common[\\\/]/igm,'common\\');
            let componentPath = pathlib.join(finalMod, pathCleaned)
            //console.log(`Component path will be written: ${componentPath}`)
            fs.mkdirpSync(pathlib.dirname(componentPath))
            fs.writeFileSync(componentPath, content, {
                encoding: 'utf8'
            })
        } else {
            //console.log('No usable modifiers found, skipping');
        }
    }
    writeDebug('props_all_' + genparams.chosenGame + '.csv', Object.keys(debug_allprops).map(x => x + ',' + debug_allprops[x].values).join('\n'))
    writeDebug('props_matched_' + genparams.chosenGame + '.csv', Object.keys(debug_matchedProps).map(x => x + ',' + debug_matchedProps[x].values).join('\n'))
    writeDebug('content_' + genparams.chosenGame + '.txt', debug_contents.join('\n\n\n\n\n\n'))

    const rpString = rp.map(x => `replace_path="${x}"`).join('\n')
    fs.writeFileSync(pathlib.join(finalMod, '/descriptor.mod'), `
version="1.0.0"\n
tags={\n
    "Gameplay"\n
}\n
${rpString}
name="${modName}"\n
supported_version="*"\n
`)
    fs.writeFileSync(pathlib.join(genparams.derived.gameDocumentsPath, `mod/${modName}.mod`), `
version="1.0.0"\n
tags={\n
    "Gameplay"\n
}\n
${rpString}
name="${modName}"\n
supported_version="*"\n
path=mod/${modName}\n
`)
    const hashData = await hashElement(finalMod,{
        encoding: 'hex'
        
    })
    const hash = hashData.hash
    writeDebug('allFiles.csv', balancer.getAll().join("\n"))
    writeDebug('interestingFiles.csv', balancer.getInteresting().join("\n"))
    console.log('')
    console.log('')
    console.log(`Wrote mod to ${finalMod}`)
    console.log("List of interesting touched files is available in the debug folder");
    console.log('')
    if(!genparams.derived.imported){
        console.log(`To share this mod configuration, give this code to your friends:`);
        console.log(`${serializeGenParams(genparams)}`)
    }
    console.log('')
    console.log("SHA1 HASH1:  "+ hash)
}
main();