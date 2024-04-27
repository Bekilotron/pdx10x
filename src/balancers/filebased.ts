import _ from "lodash";
import { Balancer } from "./balancer";
export class FileBasedBalancer extends Balancer{
    getFactor(key: string,value: string,count: number,pathContext: string[]){
        const fileName = pathContext[0];
        if(this.balancedAlready[fileName])
            return this.balancedAlready[fileName];
        return this.randomBetweenI32(Math.log(count),1);
    }
}