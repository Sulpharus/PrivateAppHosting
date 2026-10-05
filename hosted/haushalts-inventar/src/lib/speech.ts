import { showToast } from '../components/Toast';
import { language, locale, t } from '../i18n';
import type { Item } from '../types';
import { warrantyState } from './domain';
import { categoryLabel, formatMoney, roomLabel } from './format';

/** Reads an item aloud in the active language with the browser's own voices. */
export function speakItem(item: Item): void {
  const synth = globalThis.speechSynthesis;
  if (!synth) {
    showToast(t('speech.unsupported'));
    return;
  }
  const text = t('speech.item', {
    name: item.name,
    category: categoryLabel(item.category),
    room: roomLabel(item.location),
    price: item.purchasePrice ? formatMoney(item.purchasePrice, 0) : t('speech.noPrice'),
    warranty: t(`warranty.state.${warrantyState(item, new Date())}`),
  });
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(item.notes ? `${text} ${item.notes}` : text);
  utterance.lang = locale();
  const voice = synth.getVoices().find((entry) => entry.lang.toLowerCase().startsWith(language()));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}
