import { createFileRoute } from '@tanstack/react-router';
import { setCurrentLocation, useExpenseForm } from './-expense.common';
import { coordinateFormat, SG_CENTER } from '../../../../utils';
import { APIProvider, ControlPosition, Map, Marker } from '@vis.gl/react-google-maps';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/geolocation')({
  validateSearch(search) {
    if (search) {
      if (search['readOnly'] && typeof search['readOnly'] === 'boolean') {
        return { readOnly: search['readOnly'] as boolean };
      }
    }
    return {};
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { readOnly = false } = Route.useSearch();
  const form = useExpenseForm();

  return (
    <div className='mb-20 grid grid-cols-2 gap-x-2'>
      <form.AppField name='geolocation.latitude'>
        {({ NumericInput }) => (
          <NumericInput label='Latitude' containerCn='mt-2' numberFormat={coordinateFormat} readOnly={readOnly} />
        )}
      </form.AppField>
      <form.AppField name='geolocation.longitude'>
        {({ NumericInput }) => (
          <NumericInput label='Longitude' containerCn='mt-2' numberFormat={coordinateFormat} readOnly={readOnly} />
        )}
      </form.AppField>
      {readOnly || (
        <>
          <button className='btn-primary btn' onClick={() => setCurrentLocation(form)}>
            Use my location
          </button>
          <button className='btn-warning btn' onClick={() => form.setFieldValue('geolocation', undefined)}>
            Clear
          </button>
        </>
      )}

      <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
        <Map
          className='col-span-2 mt-4 h-100'
          gestureHandling='greedy'
          disableDefaultUI={false}
          zoomControl
          mapTypeControl={false}
          fullscreenControl={false}
          streetViewControl={false}
          defaultCenter={{
            lat: form.getFieldValue('geolocation.latitude') ?? SG_CENTER.lat,
            lng: form.getFieldValue('geolocation.longitude') ?? SG_CENTER.lng,
          }}
          defaultZoom={12}
          onClick={e => {
            const latLng = e.detail.latLng;
            if (!latLng || readOnly) return;
            form.setFieldValue('geolocation', { accuracy: 0, latitude: latLng.lat, longitude: latLng.lng });
          }}
          options={{
            zoomControlOptions: {
              position: ControlPosition.RIGHT_BOTTOM,
            },
          }}
        >
          <form.AppField name='geolocation'>
            {field =>
              field.state.value && (
                <Marker
                  position={{ lat: field.state.value.latitude, lng: field.state.value.longitude }}
                  draggable
                  onDragEnd={e => {
                    const lat = e.latLng?.lat();
                    const lng = e.latLng?.lng();
                    if (!lat || !lng) return;

                    field.handleChange({
                      accuracy: 0,
                      latitude: lat,
                      longitude: lng,
                    });
                  }}
                />
              )
            }
          </form.AppField>
        </Map>
      </APIProvider>
    </div>
  );
}
