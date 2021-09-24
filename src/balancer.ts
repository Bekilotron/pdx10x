export class Balancer{
    counterEach: number=0;
    counterPeriod: number =0;
    seed: number
    constructor(seed: number){
        this.seed = seed;
    }
    public balance(key: string,value: string){
        const factor = Math.sin(this.counterPeriod + this.seed)
        let setValue = Number(value);
        if(value.indexOf('.') > -1 && factor < -0.5) {
            setValue = setValue * 0.1
        }
        this.counterEach++;
        if(this.counterEach % 30 === 0){
            this.counterPeriod++;
        }
        return `${key} = ${setValue * (factor > 0.5 ? 10 : 1)}`;
    }
}