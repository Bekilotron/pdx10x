import _ from "lodash";
import random, { Random } from 'random'
import { Balancer } from "./balancer";
export class TraitBalancer extends Balancer{
    values: {[key: string]: number} = {};
    getFactor(fileName: string,key: string,value: string){
        if(!this.values[key]){
            this.values[key] = this.rng.float(-1,1)
        }
        return this.values[key]
    }
}