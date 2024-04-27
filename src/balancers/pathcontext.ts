import _ from "lodash";
import { Balancer, BuffOrNerf } from "./balancer";
export class PathContextBalancer extends Balancer{
    values: {[key: string]: number} = {};
    getFactor(key: string,value: string,count: number,pathContext: string[]){
        const balanceKey = pathContext[0] + "." + pathContext[1] ?? '';
        if(!this.values[balanceKey]){
            this.values[balanceKey] = this.randomBetweenI32(-1,1)
            const buffState = this.getBuffOrNerf(this.values[balanceKey]);
            if (buffState == BuffOrNerf.Buff){
                console.log("Buffing " +balanceKey + " by " + this.values[balanceKey]);
            }else if(buffState == BuffOrNerf.Nerf){
                console.log("Nerfing " +balanceKey + " by " + this.values[balanceKey]);
            }
        }
        return this.values[balanceKey]
    }
}