import { t as msg,useLanguage } from '../../../packages/ui/src/i18n';
import { positionName } from '../../../packages/contracts/src';

export function BoardPositionLabel({slot}:{slot:number}) {
  useLanguage();
  return <span className="board-position-name">{msg(positionName(slot)??'')}</span>;
}
