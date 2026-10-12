import { t as msg,useLanguage } from './i18n';
import { positionName } from '../../../packages/contracts/src';

export function BoardPositionLabel({slot}:{slot:number}) {
  useLanguage();
  return <span className="board-position-name">{msg(positionName(slot)??'')}</span>;
}
