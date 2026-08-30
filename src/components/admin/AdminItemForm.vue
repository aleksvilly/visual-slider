<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AdminCategory, PublicationStatus } from '../../lib/admin/types';

interface InitialValues {
  categoryId?: string;
  title?: string;
  sourceUrl?: string;
  imageUrl?: string;
  creator?: string;
  sourceSite?: string;
  priceAmount?: number | string | null;
  priceCurrency?: string;
  publicationStatus?: PublicationStatus;
  attributes?: Record<string, number | string>;
}

const props = withDefaults(
  defineProps<{
    categories: AdminCategory[];
    mode: 'create' | 'edit';
    initial?: InitialValues;
    errorMessage?: string;
  }>(),
  { initial: () => ({}), errorMessage: '' },
);

const selectedCategoryId = ref(
  props.initial.categoryId ?? props.categories.find((category) => category.status === 'published')?.id ?? props.categories[0]?.id ?? '',
);
const submitting = ref(false);
const selectedCategory = computed(() =>
  props.categories.find((category) => category.id === selectedCategoryId.value),
);
const enabledAttributes = computed(() =>
  selectedCategory.value?.attributes.filter((attribute) => attribute.enabled) ?? [],
);

function initialAttributeValue(attributeId: string, defaultValue: number) {
  return props.initial.attributes?.[attributeId] ?? defaultValue;
}
</script>

<template>
  <div v-if="categories.length === 0" class="admin-empty-state admin-empty-state-compact">
    <span>0</span>
    <h2>{{ errorMessage ? 'Form unavailable' : 'No categories available' }}</h2>
    <p>{{ errorMessage || 'Create a category and its slider definitions before importing an item.' }}</p>
  </div>
  <form v-else method="post" class="admin-item-form" :aria-busy="submitting" @submit="submitting = true">
    <p v-if="errorMessage" class="admin-form-message admin-form-error" role="alert">
      {{ errorMessage }}
    </p>

    <section class="admin-form-section">
      <div class="admin-form-section-head">
        <div>
          <p class="eyebrow">Catalog identity</p>
          <h2>{{ mode === 'create' ? 'Manual import' : 'Item details' }}</h2>
        </div>
        <span>Required fields</span>
      </div>
      <div class="admin-form-grid">
        <label>
          <span>Category</span>
          <select
            v-if="mode === 'create'"
            v-model="selectedCategoryId"
            name="categoryId"
            required
          >
            <option v-for="category in categories" :key="category.id" :value="category.id">
              {{ category.name }} · {{ category.status }}
            </option>
          </select>
          <template v-else>
            <input type="hidden" name="categoryId" :value="selectedCategoryId" />
            <select :value="selectedCategoryId" disabled>
              <option v-for="category in categories" :key="category.id" :value="category.id">
                {{ category.name }}
              </option>
            </select>
          </template>
        </label>
        <label>
          <span>Publication status</span>
          <select
            name="publicationStatus"
            :value="initial.publicationStatus ?? 'draft'"
            required
          >
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label class="admin-form-wide">
          <span>Title</span>
          <input name="title" :value="initial.title" required maxlength="240" />
        </label>
        <label class="admin-form-wide">
          <span>Canonical source URL</span>
          <input name="sourceUrl" type="url" :value="initial.sourceUrl" required />
        </label>
        <label class="admin-form-wide">
          <span>Image URL</span>
          <input name="imageUrl" type="url" :value="initial.imageUrl" required />
        </label>
        <label>
          <span>Creator / brand</span>
          <input name="creator" :value="initial.creator" maxlength="240" />
        </label>
        <label>
          <span>Source site</span>
          <input name="sourceSite" :value="initial.sourceSite" required maxlength="160" />
        </label>
        <label>
          <span>Price</span>
          <input
            name="priceAmount"
            type="number"
            min="0"
            step="0.01"
            :value="initial.priceAmount ?? ''"
            placeholder="Optional"
          />
        </label>
        <label>
          <span>Currency</span>
          <input
            name="priceCurrency"
            :value="initial.priceCurrency"
            maxlength="3"
            pattern="[A-Za-z]{3}"
            placeholder="EUR"
          />
        </label>
      </div>
    </section>

    <section class="admin-form-section">
      <div class="admin-form-section-head">
        <div>
          <p class="eyebrow">Semantic coordinates</p>
          <h2>{{ selectedCategory?.name }} attributes</h2>
        </div>
        <span>Normalized 0–100</span>
      </div>
      <div v-if="enabledAttributes.length" class="admin-attribute-grid">
        <label v-for="attribute in enabledAttributes" :key="attribute.id">
          <span><strong>{{ attribute.label }}</strong><small>{{ attribute.key }}</small></span>
          <input
            :name="`attribute:${attribute.id}`"
            type="number"
            min="0"
            max="100"
            step="1"
            :value="initialAttributeValue(attribute.id, attribute.defaultValue)"
            required
          />
          <small>{{ attribute.lowLabel }} → {{ attribute.highLabel }}</small>
        </label>
      </div>
      <p v-else class="admin-form-note">This category has no enabled semantic attributes.</p>
    </section>

    <div class="admin-form-actions">
      <a href="/admin/items/">Cancel</a>
      <button type="submit" name="intent" value="save" :disabled="submitting">
        {{ submitting ? 'Saving…' : mode === 'create' ? 'Import item' : 'Save changes' }}
      </button>
    </div>
  </form>
</template>
