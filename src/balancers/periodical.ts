import _ from "lodash";
import { Balancer } from "./balancer";
export class PeriodicalBalancer extends Balancer{
    period=10;
    counter: number =0;
    current: number =0;
    getFactor(fileName: string,key: string,value: string){
        if(this.counter % this.period === 0){
            this.current = this.rng.float(-1,1);
        }
        this.counter++;
        return this.current
    }
}