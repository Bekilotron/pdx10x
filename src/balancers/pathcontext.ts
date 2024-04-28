import _ from "lodash";
import { Balancer, BuffOrNerf } from "./balancer";
export class PathContextBalancer extends Balancer{
    values: {[key: string]: number} = {};
    getFactor(key: string,value: string,count: number,pathContext: string[]){
        const balanceKey = pathContext[0] + "." + pathContext[1] ?? '';
        if(!this.values[balanceKey]){
            this.values[balanceKey] = this.randomBetweenI32(-1,1)
        }
        return this.values[balanceKey]
    }
}