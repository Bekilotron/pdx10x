import * as fs from 'fs-extra';
import { promises as fsp } from 'fs'
import * as pathlib from 'path';
import * as _ from 'lodash'
import { string } from 'yargs';
const { MultiSelect } = require('enquirer');
import zlib from "zlib";
export interface ModFileLine {
    key: string;
    value: string;
}
export interface GameSettings{
    gamePathName: string,
    path: string,
    modifierBlacklist: string[],
    optional: {[key: string]:string[]}
    dirSets:  {[key: string]:string[]}
}
export type fullPath = string
export async function readAllFiles(paths: string[]): Promise<{ [key: string]: string }> {
    let arr = paths.map(x => {
        return fsp.readFile(x, 'utf8')
    })
    const data = await Promise.all(arr)
    let ret: { [key: string]: string } = {};
    for (let i = 0; i < data.length; i++) {
        ret[paths[i]] = data[i];
    }
    return ret;
}
export interface Mod {
    name: string;
    value: string;
    replacePaths: string[]
}
export function readModfile(mf: string): ModFileLine[]{
    const re = /(^[^=]*)=("[^"]*"|{[^}]*})/igm
    let m;
    const mfl: ModFileLine[] = []
    while(m = re.exec(mf)){
        mfl.push({
            key: m[1],
            value: m[2].replace(/^"([^]*)"$/,'$1')
        })
    }
    return mfl
}
export async function getModlist(gameDocumentsFolder: string): Promise<Mod[]> {
    const modDocuments = pathlib.join(gameDocumentsFolder, '/mod')
    let files = fs.readdirSync(modDocuments).filter(x => x.startsWith('ugc_'));
    const mods: Mod[] = [];
    const modfileContent = await readAllFiles(files.map(x => pathlib.join(modDocuments, x)))
    for (const mod of Object.values(modfileContent)) {
        const modfile = readModfile(mod)
        const contentPath = modfile.find(x=>x.key === 'path')!.value
        const modName = modfile.find(x=>x.key === 'name')!.value
        mods.push({
            name: modName,
            value: contentPath,
            replacePaths: modfile.filter(x=>x.key === 'replace_path').map(x=>x.value)
        })

    }
    return mods
}
export async function writeDebug(fileName: string, data: string){
    fs.writeFileSync(pathlib.join('debug/',fileName),data);
}
export function readDirFiles(dir: string): string[]{
    return fs.readdirSync(dir,{withFileTypes: true}).filter(x=>{
        return x.isFile()
    }).map(x=>x.name);
}

export async function multiSelect<T>(userPrompt: string,choices: {[key: string]: string[]},invert=false){
    let choiceArray = Object.keys(choices);
    if(choiceArray.length === 0) return []
    const prompt = new MultiSelect({
        name: "value",
        message: userPrompt,
        choices:choiceArray
    })

    let ans:string[] = await prompt.run();
    let selected: string[] = []
    for(const choice of Object.keys(choices)){
        const contained = ans.indexOf(choice) > -1;
        if(contained && !invert){
            selected.push(choice)
        }
        if(!contained && invert){
            selected.push(choice)
        }
    }
    return selected;
}
export  function selectionToValue<T>(selection: string[],values: {[key: string]: T[]}): T[]{
    let ret:T[][] = []
    for(const key of Object.keys(values)){
        if(selection.indexOf(key) > -1){
            ret.push(values[key]);
        }
    }
    return _.flatten(ret);
}
export interface GenParams {
    includeDirs: string[],
    blacklistAdditions: string[],
    mods: string[],
    seed: number
}
export function serializeGenParams(gp: GenParams){
    return zlib.gzipSync(JSON.stringify(gp)).toString('hex')
}
export function deserializeGenParams(gpS: string): GenParams{
    let buf = Buffer.from(gpS,'hex');
    let unzip = zlib.gunzipSync(buf).toString('utf8');
    return JSON.parse(unzip);
}