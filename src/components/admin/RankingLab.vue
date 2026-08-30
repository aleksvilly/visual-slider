<script setup lang="ts">
import { computed, ref } from 'vue';
import { rankItemsWithExplanation } from '../../lib/ranking';
import type { CatalogItem, CategoryDefinition, Preferences } from '../../lib/types';

const props = defineProps<{
  category: CategoryDefinition;
  items: CatalogItem[];
}>();

const preferences = ref<Preferences>(
  Object.fromEntries(
    props.category.attributes.map((attribute) => [attribute.key, attribute.defaultValue]),
  ),
);
const inspectedId = ref(props.items[0]?.id ?? '');

const ranked = computed(() =>
  rankItemsWithExplanation(props.items, preferences.value, props.category.attributes),
);

const inspected = computed(
  () => ranked.value.find((result) => result.item.id === inspectedId.value) ?? ranked.value[0],
);

function updatePreference(key: string, event: Event) {
  preferences.value = {
    ...preferences.value,
    [key]: Number((event.target as HTMLInputElement).value),
  };
}
</script>

<template>
  <div class="ranking-lab">
    <section class="ranking-controls">
      <div class="ranking-section-head">
        <div>
          <p class="eyebrow">Query</p>
          <h2>{{ category.name }}</h2>
        </div>
        <span>Soft preferences</span>
      </div>
      <label v-for="attribute in category.attributes" :key="attribute.key" class="ranking-slider">
        <span>
          <strong>{{ attribute.label }}</strong>
          <output>{{ preferences[attribute.key] }}</output>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="preferences[attribute.key]"
          @input="updatePreference(attribute.key, $event)"
        />
        <small><i>{{ attribute.lowLabel }}</i><i>{{ attribute.highLabel }}</i></small>
      </label>
    </section>

    <section class="ranking-results">
      <div class="ranking-section-head">
        <div>
          <p class="eyebrow">Ordered results</p>
          <h2>{{ ranked.length }} candidates</h2>
        </div>
        <span>No hard constraints</span>
      </div>
      <div v-if="ranked.length === 0" class="admin-empty-state admin-empty-state-compact">
        <span>0</span>
        <h2>No published items</h2>
        <p>Publish a catalog item to include it in this ranking query.</p>
      </div>
      <button
        v-for="(result, index) in ranked"
        :key="result.item.id"
        type="button"
        class="ranking-result"
        :class="{ active: inspected?.item.id === result.item.id }"
        @click="inspectedId = result.item.id"
      >
        <b>{{ String(index + 1).padStart(2, '0') }}</b>
        <span>
          <strong>{{ result.item.title }}</strong>
          <small>{{ result.item.creator || result.item.sourceSite }}</small>
        </span>
        <output>{{ Math.round(result.score * 100) }}%</output>
      </button>
    </section>

    <section v-if="inspected" class="ranking-inspector">
      <div class="ranking-section-head">
        <div>
          <p class="eyebrow">Score explanation</p>
          <h2>{{ inspected.item.title }}</h2>
        </div>
        <strong class="ranking-total">{{ Math.round(inspected.score * 100) }}%</strong>
      </div>
      <dl class="ranking-summary">
        <div>
          <dt>Weighted average distance</dt>
          <dd>{{ inspected.explanation.averageDistance?.toFixed(2) ?? '—' }}</dd>
        </div>
        <div>
          <dt>Active weight</dt>
          <dd>{{ inspected.explanation.totalWeight.toFixed(2) }}</dd>
        </div>
        <div>
          <dt>Missing attributes</dt>
          <dd>{{ inspected.explanation.missingAttributes.length }}</dd>
        </div>
        <div>
          <dt>Hard constraints</dt>
          <dd>Not configured</dd>
        </div>
      </dl>
      <div class="admin-table-scroll">
        <table class="admin-table ranking-breakdown">
          <thead>
            <tr>
              <th>Attribute</th>
              <th>User slider</th>
              <th>Raw item value</th>
              <th>Distance</th>
              <th>Weight</th>
              <th>Weighted distance</th>
              <th>Score contribution</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="component in inspected.explanation.components" :key="component.key">
              <td>{{ component.label }}</td>
              <td>{{ component.preference }}</td>
              <td>{{ component.itemValue ?? 'Missing' }}</td>
              <td>{{ component.distance ?? 'Ignored' }}</td>
              <td>{{ component.weight }}</td>
              <td>{{ component.weightedDistance?.toFixed(2) ?? '—' }}</td>
              <td>{{ component.scoreContribution === undefined ? '—' : `${(component.scoreContribution * 100).toFixed(2)}%` }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <details class="ranking-raw-values">
        <summary>Raw item attribute object</summary>
        <pre>{{ JSON.stringify(inspected.item.attributes, null, 2) }}</pre>
      </details>
      <p class="ranking-formula">
        Total score = the sum of per-attribute score contributions. Missing values are omitted, not treated as zero.
      </p>
    </section>
  </div>
</template>
