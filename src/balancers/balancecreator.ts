import { BalancerOptions } from "../tools";
import { FileBasedBalancer } from "./filebased";
import { PeriodicalBalancer } from "./periodical";
import { RandomBalancer } from "./random";
import { TraitBalancer } from "./traits";

export enum BalancerType{
    filebased,periodical,traits,random
}
export function createBalancer(kind: BalancerType,bp: BalancerOptions){
    switch(kind){
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