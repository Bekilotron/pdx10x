import _ from "lodash";
import { Balancer } from "./balancer";
export class TraitBalancer extends Balancer{
    values: {[key: string]: number} = {};
    getFactor(key: string,value: string,count: number,pathContext: string[]){
        if(!this.values[key]){
            this.values[key] = this.randomBetweenI32(-1,1)
        }
        return this.values[key]
    }
}