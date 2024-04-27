import { BalancerOptions } from "../tools";
import { FileBasedBalancer } from "./filebased";
import { PeriodicalBalancer } from "./periodical";
import { RandomBalancer } from "./random";
import { TraitBalancer } from "./traits";

export enum BalancerType{
    filebased="File Based",
    periodical="Wave distribution",
    traits="Traits",
    random="Completely random"
}
export function createBalancer(bp: BalancerOptions){
    switch(bp.balancer){
        case BalancerType.filebased:
            return new FileBasedBalancer(bp);
        case BalancerType.periodical:
            return new PeriodicalBalancer(bp);
        case BalancerType.traits:
            return new TraitBalancer(bp);
        case BalancerType.random:
            return new RandomBalancer(bp);
    }
}