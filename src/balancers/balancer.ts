
import random, { Random } from 'random'
import { BalancerOptions } from '../tools';
export abstract class Balancer{
    bp: BalancerOptions;
    rng: Random;
    constructor(bp: BalancerOptions){
        this.bp = bp;
        this.rng = random.clone(bp.seed);
    }
    getMult(fileName: string,key: string,value: string,possibleValues: number[]){
        let setValue = Number(value);
        let multiplier;
        const factor = this.getFactor(fileName,key,value,possibleValues.length);
        multiplier = 1.0;
        
        const NERF = this.bp.chance_01x / 100 * 2 -1;
        const BUFF = Math.min(1, this.bp.chance_10x / 100 * 2 + NERF);

        if(key.indexOf('cost') > -1 && setValue > 0){//positive costs have inverse scaling
            if(setValue < 0 && factor < NERF){
                multiplier = 10
            }
            if( factor <= BUFF ){
                multiplier = 0.1
            }
            return this.normalizeValues(setValue,multiplier,possibleValues);
        }

        if(value.indexOf('.') > -1 && factor < NERF) {
            multiplier= 0.1
        }
        if(factor <= BUFF){
            multiplier = 10
        }
        this.balancedAlready[fileName] = multiplier
        return this.normalizeValues(setValue,multiplier,possibleValues);

    }
    public balance(fileName: string,key: string,value: string, possibleValues: number[]){
        const resolvedValue = this.getMult(fileName,key,value, possibleValues);
        return `${key} = ${resolvedValue}`;
    }
    protected normalizeValues(setValue: number, multiplier: number,possibleValues: number[]){
        let resolvedValue = setValue * multiplier;
        const sorted = possibleValues.sort((x,y)=>x-y);
        if(setValue === -1){
            if(sorted.indexOf(-1) !== -1 && sorted.find(x=>x < 0 && x !== -1)){
                //-1 probably has special meaning, don't balance it.
                return setValue;
            }
        }
        if(sorted.filter(x=> x >= -1 && x <= 0).length === sorted.length){
            //all possible values are in range of -1..0
            return Math.max(-0.99,Math.min(0.01,resolvedValue));
        }
        if(sorted.filter(x=> x >= 0 && x <= 1).length === sorted.length){
            //all possible values are in range of 0..1
            //return Math.max(0.01,Math.min(0.99,resolvedValue));
        }
        if(sorted.filter(x=> x >= -1 && x <= 1).length === sorted.length){
            //all possible values are in range of -1..1
            //return Math.max(-0.99,Math.min(0.99,resolvedValue));
        }
        const highest = Math.max(sorted[0],resolvedValue);
        /*if(setValue > -100 && setValue < 0){
            resolvedValue = Math.max(-99,resolvedValue)
        }*/
        return highest;
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
    abstract getFactor(fileName: string,key: string,value: string,count: number): number;
}