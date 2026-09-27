import { withFieldGroup, type ComboBoxProps } from '#client/components/Form';
import { trpc, type RouterInputs, type RouterOutputs } from '#client/trpc';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

type SuggestionInput = RouterInputs['expense']['getSuggestions'];
type SuggestionKind = SuggestionInput['kind'];
type SuggestionContext = SuggestionInput['context'];
type SuggestionLocation = SuggestionInput['location'];

export type SuggestionFieldProps = {
  kind: SuggestionKind;
  context?: SuggestionContext;
  location?: SuggestionLocation;
  fetchDebouncing?: number;
} & Omit<ComboBoxProps, 'options' | 'suggestionMode' | 'readOnly'>;

type SuggestionOutput = RouterOutputs['expense']['getSuggestions'];
type SuggestionBoundaries = SuggestionOutput['locationBounds'];

function isExceedBoundaries(currentLocation: SuggestionLocation, boundaries: SuggestionBoundaries) {
  if ((currentLocation === undefined) !== (boundaries === undefined)) return true;
  if (currentLocation === undefined || boundaries === undefined) return false;

  const { isOnline, latitude, longitude } = currentLocation;
  const { wasOnline, minLat, maxLat, minLng, maxLng } = boundaries;

  if ((isOnline ?? false) !== boundaries.wasOnline) return true;
  if (isOnline || wasOnline) return false;

  return latitude < minLat || latitude > maxLat || longitude < minLng || longitude > maxLng;
}

export const ExpenseSuggestableField = withFieldGroup({
  defaultValues: { text: '' as string | null },
  props: {} as unknown as SuggestionFieldProps,
  render({ group, kind, context, location, fetchDebouncing = 500, onSuggestionSelected, ...rest }) {
    const [search, setSearch] = useState('' as null | undefined | string);
    const [cachedLocation, setCachedLocation] = useState(() => location);
    let queryInput: SuggestionInput | typeof skipToken = skipToken;
    if (search || context || location) {
      queryInput = { kind, search: search ?? '', context, location: cachedLocation };
    }
    const { data } = useQuery(trpc.expense.getSuggestions.queryOptions(queryInput));

    useEffect(() => {
      if (isExceedBoundaries(location, data?.locationBounds)) {
        setCachedLocation(location);
      }
    }, [data?.locationBounds, location?.isOnline, location?.latitude, location?.longitude]);

    return (
      <group.AppField
        name='text'
        validators={{
          onChangeAsyncDebounceMs: fetchDebouncing,
          onChangeAsync: ({ value, fieldApi }) => {
            if (fieldApi.form.state.isSubmitting) return;
            setSearch(value);
          },
        }}
      >
        {field => (
          <field.ComboBox
            suggestionMode
            {...rest}
            options={(data?.suggestions ?? []).map(({ text }) => text)}
            onSuggestionSelected={suggestion => {
              group.setFieldValue('text', suggestion, { dontValidate: true });
              onSuggestionSelected?.(suggestion);
            }}
          />
        )}
      </group.AppField>
    );
  },
});
