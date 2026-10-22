import type { MicroContext } from '../../contracts';
import { mountReact } from '../../shared/runtime';
import { DeckEditor } from './DeckEditor';
export const apiVersion = 1;
export const mount = (element: HTMLElement, context: MicroContext) =>
    mountReact(DeckEditor, element, context);
