import _ from "lodash";
import { Balancer } from "./balancer";
export class FileBasedBalancer extends Balancer{
    getFactor(fileName: string,key: string,value: string){
        if(this.balancedAlready[fileName])
            return this.balancedAlready[fileName];
        return this.rng.float(-1,1);
    }
}