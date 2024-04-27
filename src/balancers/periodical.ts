import _ from "lodash";
import { Balancer } from "./balancer";
export class PeriodicalBalancer extends Balancer{
    period=8;
    counter: number =0;
    current: number =0;
    getFactor(key: string,value: string,count: number,pathContext: string[]){
        if(this.counter % this.period === 0){
            this.current = this.randomBetweenI32(-1,1);
        }
        this.counter++;
        return this.current
    }
}