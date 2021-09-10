import * as fs from 'fs-extra';
import * as pathlib from 'path';
import * as _ from 'lodash'
import * as micromatch from 'micromatch';
import {default as memoize} from 'memoizee';
import * as os from 'os';
import * as yargs from 'yargs';
const programArgs = yargs
  .option('game', {
    alias: 'g',
    type: 'string',
    description: 'A game to load values from (.json file)',
    required:true
  }).option('gamePath',{
      alias: 'p',
      type: 'string',
      description:'Path to the game. Ie. C:/Program Files(x86)/steamapps/common/Hearts of Iron IV'
  })
.argv
const gameConfig = require('./eu4.json');

const hoi4path = 'C:\\SteamGames\\steamapps\\common\\Hearts of Iron IV';
//const hoi4path = 'C:\\SteamGames\\steamapps\\common\\Europa Universalis IV';
const documentsFolder = pathlib.join(os.homedir(),'/Documents/Paradox Interactive')


const gamePathName: string = gameConfig.gamePathName
const gameDocuments = pathlib.join(documentsFolder,gamePathName)
const includeDirs: string[] = gameConfig.includeDirs
const blacklist: string[]|undefined = gameConfig.modifierBlacklist
if(!fs.existsSync(pathlib.join(gameDocuments,'mods_registry.json'))){
    console.log(`No data found at: '${gameDocuments}'`)
    console.log('Please try running again with --docPath specified or try running the game once before.');
}
console.log(`Found game docs in ${gameDocuments}`)
let fileList:string[] = []
for(const dir of includeDirs){
    let fullPath = pathlib.join(hoi4path,dir)

    fileList.push(...fs.readdirSync(fullPath).map(x=>pathlib.join(hoi4path,dir,x)))
}
let hoi4UniqueModifiers:any = {}
const modifierRegex = /(\w*)\s*=\s*(\d+[.,]\d+|\d+)\s*?/g

function anyFilterMatches(str:string){
    if(blacklist){
        return micromatch.any(str,blacklist);
    }
    return true;
}
const mmAny = memoize(anyFilterMatches,{
    primitive: true
})
let finalMod = pathlib.join(gameDocuments,`mod/GENERATED_10xMM`);
fs.ensureDirSync(finalMod)
fs.emptyDirSync(finalMod)
for(const path of fileList){
    console.log('Reading: '+path);
    let content = fs.readFileSync(path).toString('utf8');
    let match;
    let matchesAny = false;
    content = content.replace(modifierRegex,((match,p1,p2,offset,string)=>{
        if(!isNaN(Number(p2)) && !mmAny(p1)){
            matchesAny = true;
            hoi4UniqueModifiers[p1] = {
                value:p2,
                file: path,
                context: match
            };
            return `${p1} = ${Number(p2) * 10}`;
        }else{
            return match;
        }
    }))
    if(matchesAny){
        let componentPath = pathlib.join(finalMod,path.replace(pathlib.join(hoi4path),''))
        console.log(`Component path will be written: ${componentPath}`)
        fs.mkdirpSync(pathlib.dirname(componentPath))
        fs.writeFileSync(componentPath,content,{
            encoding: 'utf8'
        })
    }else{
        console.log('No usable modifiers found, skipping');
    }
}
fs.writeFileSync(pathlib.join(finalMod,'/descriptor.mod'),`
version="1.0.0"\n
tags={\n
    "Gameplay"\n
}\n
name="GENERATED_10xMM"\n
supported_version="*"\n
`)
console.log(`Wrote mod to ${finalMod}`)