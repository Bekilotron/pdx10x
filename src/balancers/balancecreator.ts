import { FileBasedBalancer } from "./filebased";
import { PeriodicalBalancer } from "./periodical";
import { TraitBalancer } from "./traits";

export enum BalancerType{
    filebased,periodical,traits
}
export function createBalancer(kind: BalancerType,seed: number){
    switch(kind){
        case BalancerType.filebased:
            return new FileBasedBalancer(seed);
        case BalancerType.periodical:
            return new PeriodicalBalancer(seed);
        case BalancerType.traits:
            return new TraitBalancer(seed);
    }
}