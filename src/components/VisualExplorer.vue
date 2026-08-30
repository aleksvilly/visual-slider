<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { preferencesFromItem, rankItems } from '../lib/ranking';
import type {
  CatalogItem,
  CategoryDefinition,
  Preferences,
} from '../lib/types';

const props = defineProps<{
  category: CategoryDefinition;
  items: CatalogItem[];
}>();

const makeDefaults = (): Preferences =>
  Object.fromEntries(
    props.category.attributes.map((attribute) => [
      attribute.key,
      attribute.defaultValue,
    ]),
  );

const preferences = ref<Preferences>(makeDefaults());
const savedIds = ref<string[]>([]);
const showMoodboard = ref(false);

onMounted(() => {
  try {
    const stored = localStorage.getItem('visual-slider:moodboard');
    if (stored) savedIds.value = JSON.parse(stored);
  } catch {
    savedIds.value = [];
  }
});

const ranked = computed(() =>
  rankItems(props.items, preferences.value, props.category.attributes),
);

const savedItems = computed(() =>
  props.items.filter((item) => savedIds.value.includes(item.id)),
);

function updatePreference(key: string, event: Event) {
  const target = event.target as HTMLInputElement;
  preferences.value = {
    ...preferences.value,
    [key]: Number(target.value),
  };
}

function reset() {
  preferences.value = makeDefaults();
}

function explore(item: CatalogItem) {
  preferences.value = preferencesFromItem(item, props.category.attributes);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function save(item: CatalogItem) {
  const exists = savedIds.value.includes(item.id);
  savedIds.value = exists
    ? savedIds.value.filter((id) => id !== item.id)
    : [...savedIds.value, item.id];
  localStorage.setItem(
    'visual-slider:moodboard',
    JSON.stringify(savedIds.value),
  );
}

const isSaved = (item: CatalogItem) => savedIds.value.includes(item.id);
</script>

<template>
  <section class="explorer-shell">
    <aside class="control-panel">
      <div class="control-heading">
        <p class="eyebrow">{{ category.eyebrow }}</p>
        <h1>{{ category.name }}</h1>
        <p>{{ category.description }}</p>
      </div>

      <div class="sliders">
        <label
          v-for="attribute in category.attributes"
          :key="attribute.key"
          class="slider-row"
        >
          <div class="slider-title">
            <strong>{{ attribute.label }}</strong>
            <output>{{ Math.round(preferences[attribute.key]) }}</output>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="preferences[attribute.key]"
            @input="updatePreference(attribute.key, $event)"
          />
          <div class="slider-labels">
            <span>{{ attribute.lowLabel }}</span>
            <span>{{ attribute.highLabel }}</span>
          </div>
        </label>
      </div>

      <div class="control-actions">
        <button class="small-button" type="button" @click="reset">Reset</button>
        <button class="small-button" type="button" @click="showMoodboard = !showMoodboard">
          Moodboard · {{ savedIds.length }}
        </button>
      </div>

      <div v-if="showMoodboard" class="moodboard-drawer">
        <div class="moodboard-head">
          <strong>Saved references</strong>
          <button type="button" @click="showMoodboard = false">×</button>
        </div>
        <p v-if="savedItems.length === 0" class="muted">Nothing saved yet.</p>
        <a
          v-for="item in savedItems"
          :key="item.id"
          class="saved-item"
          :href="item.sourceUrl"
          target="_blank"
          rel="noreferrer"
        >
          <span>{{ item.title }}</span>
          <small>{{ item.sourceSite }}</small>
        </a>
      </div>
    </aside>

    <div class="results-panel">
      <div class="results-head">
        <div>
          <p class="eyebrow">Soft-ranked results</p>
          <h2>{{ ranked.length }} references</h2>
        </div>
        <p>
          Nothing is filtered out. Sliders change relevance, so the catalog keeps moving instead of collapsing to zero results.
        </p>
      </div>

      <div class="result-grid">
        <article
          v-for="({ item, score }, index) in ranked"
          :key="item.id"
          class="result-card"
        >
          <div class="image-wrap">
            <img :src="item.imageUrl" :alt="item.title" loading="lazy" />
            <span class="rank-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="match-score">{{ Math.round(score * 100) }}% match</span>
          </div>

          <div class="card-body">
            <div class="card-title-row">
              <div>
                <h3>{{ item.title }}</h3>
                <p>{{ item.creator || item.sourceSite }}</p>
              </div>
              <strong v-if="item.priceLabel">{{ item.priceLabel }}</strong>
            </div>

            <p v-if="item.note" class="item-note">{{ item.note }}</p>

            <div class="attribute-strip">
              <span
                v-for="attribute in category.attributes.slice(0, 4)"
                :key="attribute.key"
              >
                {{ attribute.label }} {{ item.attributes[attribute.key] ?? '—' }}
              </span>
            </div>

            <div class="card-actions">
              <button type="button" @click="explore(item)">Explore this</button>
              <button type="button" @click="save(item)">
                {{ isSaved(item) ? 'Saved ✓' : 'Save' }}
              </button>
              <a :href="item.sourceUrl" target="_blank" rel="noreferrer">
                {{ item.buyable ? 'View / buy ↗' : 'Source ↗' }}
              </a>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
