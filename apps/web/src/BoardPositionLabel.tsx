import { positionName } from '../../../packages/contracts/src';

export function BoardPositionLabel({slot}:{slot:number}) {
  return <span className="board-position-name">{positionName(slot)}</span>;
}
