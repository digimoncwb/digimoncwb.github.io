begin;

-- Digimon Partners: the partner is the 81st card of the decklist, marked in the editor.
update public.deck_formats
set description='Decklist de 81 cartas: 80 no deck com até 2 cópias, mais o partner nível 6. Até 8 Digi-Eggs com até 4 cópias.',
    rules_text='Deck principal de 80 cartas, com no máximo 2 cópias de cada carta, e até 8 Digi-Eggs, com no máximo 4 cópias de cada. Valem as cartas banidas e os pares proibidos da Bandai, mas não as cartas limitadas da Bandai. Limitadas a 1 cópia: BT17-018, EX2-074, BT12-085, EX2-073 e BT9-112. Cada deck pode ter 1 partner: um Digimon nível 6 incluído na decklist como 81ª carta e marcado como partner. Nenhuma outra cópia ou versão (mesmo nome) do partner pode estar entre as 80 cartas do deck.',
    change_note='O partner passa a fazer parte da decklist como 81ª carta, identificada no editor.'
where code='PARTNERS' and rules_text not like '%81ª carta%';

commit;
