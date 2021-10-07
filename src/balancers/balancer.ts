
import random, { Random } from 'random'
export abstract class Balancer{
    seed: number;
    rng: Random;
    constructor(seed: number){
        this.seed = seed;
        this.rng = random.clone(seed);
    }
    getMult(fileName: string,key: string,value: string){
        let setValue = Number(value);
        let multiplier;
        
        const factor = this.getFactor(fileName,key,value);
        multiplier = 1.0;

        if(value.indexOf('.') > -1 && factor < -0.9) {
            multiplier= 0.1
        }
        if(factor > 0.3){
            multiplier = 10
        }
        this.balancedAlready[fileName] = multiplier
        return this.normalizeValues(setValue,multiplier);

    }
    public balance(fileName: string,key: string,value: string){
        const resolvedValue = this.getMult(fileName,key,value);
        return `${key} = ${resolvedValue}`;
    }
    protected normalizeValues(setValue: number, multiplier: number){
        let resolvedValue = setValue * multiplier
        if(setValue < 1 && setValue > 0){
            resolvedValue = Math.min(0.99,resolvedValue);
        }
        if(setValue > -1 && setValue  < 0){
            resolvedValue = Math.max(-0.99,resolvedValue);
        }
        /*if(setValue > -100 && setValue < 0){
            resolvedValue = Math.max(-99,resolvedValue)
        }*/
        return resolvedValue;
    }
    public balancedAlready: {[key: string]: number} = {};
    public getInteresting(): string[]{
        const interesting = []
        for(const prop in this.balancedAlready){
            if(this.balancedAlready.hasOwnProperty(prop)){
                if(this.balancedAlready[prop] > 2){
                    interesting.push(prop);
                }
            }
        }
        return interesting;
    }
    public getAll(): string[]{
        const interesting = []
        for(const prop in this.balancedAlready){
            if(this.balancedAlready.hasOwnProperty(prop)){
                interesting.push(prop);
            }
        }
        return interesting;
    }
    abstract getFactor(fileName: string,key: string,value: string): number;
}