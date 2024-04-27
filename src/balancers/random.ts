import _ from "lodash";
import { Balancer } from "./balancer";
export class RandomBalancer extends Balancer{
    getFactor(key: string,value: string,count: number,pathContext: string[]){
        return this.randomBetweenI32(-1,1);
    }
}