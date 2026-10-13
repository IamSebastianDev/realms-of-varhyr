import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardFacts } from '../apps/web/src/CardPresentation';
import { compileContent, registry } from '../packages/content/src';
import { abilities } from '../packages/extensions/src';
import { describeAbility } from '../packages/extensions/src/describeAbility';

describe('ability explanations', () => {
  it('uses the bound amount in both the badge and its explanation', () => {
    expect(describeAbility({ id: 'armor', params: { amount: 2 } }, abilities.armor)).toEqual({
      name: 'Armor 2', description: 'Reduce each incoming damage hit by 2, down to zero.',
    });
  });

  it('uses singular draw wording in English and German while retaining plural counts', () => {
    const draw = abilities.draw;
    expect(describeAbility({id:'draw',params:{amount:1}},draw).description).toBe('Draw 1 card from your library.');
    expect(describeAbility({id:'draw',params:{amount:2}},draw).description).toBe('Draw 2 cards from your library.');
    expect(describeAbility({id:'draw',params:{amount:1}},{...draw,...draw.translations!.de!}).description).toBe('Ziehe 1 Karte aus deiner Bibliothek.');
  });

  it('renders creature abilities and every spell operation in the shared inspector', () => {
    const creature = renderToStaticMarkup(<CardFacts card={registry.cards['aldric-runewarden']}/>);
    expect(creature).toContain('Armor 1');
    expect(creature).toContain('Reduce each incoming damage hit by 1, down to zero.');
    const spell = renderToStaticMarkup(<CardFacts card={registry.cards['cleansing-light']}/>);
    expect(spell).toContain('Damage 2');
    expect(spell).toContain('Deal 2 damage to an enemy field card or player.');
    expect(spell).toContain('Heal 1');
    expect(spell).toContain('Restore 1 life to yourself.');
    expect(spell.indexOf('Damage 2')).toBeLessThan(spell.indexOf('Heal 1'));
  });

  it('requires nonempty names and descriptions, even for unused registered abilities', () => {
    const recruit = registry.cards['crown-recruit'];
    for (const key of ['name', 'description']) {
      for (const value of [undefined, '   ']) {
        const incomplete = { ...abilities.armor, [key]: value };
        expect(() => compileContent([recruit], { ...abilities, armor: incomplete })).toThrow('needs a name and description');
      }
    }
  });

  it('catches incorrect description placeholders during content import', () => {
    const armor = { ...abilities.armor, description: 'Reduce damage by {missing}.' };
    expect(() => compileContent([registry.cards['aldric-runewarden']], { ...abilities, armor })).toThrow('Missing text parameter missing');
  });

  it('refreshes content identity when an ability explanation changes', () => {
    const cards = Object.values(registry.cards);
    const edited = { ...abilities, armor: { ...abilities.armor, description: 'Absorb {amount} damage per hit.' } };
    expect(compileContent(cards, edited).version).not.toBe(compileContent(cards).version);
  });
});
