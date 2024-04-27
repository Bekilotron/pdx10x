import _ from "lodash";
import { Balancer } from "./balancer";
export class RandomBalancer extends Balancer{
    getFactor(fileName: string,key: string,value: string,count: number){
        return this.randomBetweenI32(-1,1);
    }
}