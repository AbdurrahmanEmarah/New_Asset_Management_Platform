import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@/api/types';
import { loadMyJobs } from '@/jobs/repository';
import { resetTestApi, testApi } from '@/test-api';
import { renderScreen } from '@/test-utils';
import { CompleteJobScreen } from './CompleteJobScreen';
import { JobDetailScreen } from './JobDetailScreen';
import { MyJobsScreen } from './MyJobsScreen';
import { ScanScreen } from './ScanScreen';

jest.mock('@/api', () => {
  const types = jest.requireActual('@/api/types');
  const { testApi: holder } = jest.requireActual('@/test-api');
  return {
    ...types,
    api: new Proxy({}, { get: (_t, key) => (...args: unknown[]) => holder.current[key](...args) }),
    demoNetwork: {
      isOnline: () => holder.current.isOnline(),
      setOnline: (online: boolean) => holder.current.setOnline(online),
    },
  };
});

const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
}));

let mockPermission: { granted: boolean; canAskAgain: boolean } | null = { granted: true, canAskAgain: true };
jest.mock('expo-camera', () => {
  const { View } = jest.requireActual('react-native');
  return {
    CameraView: (props: object) => <View {...props} />,
    useCameraPermissions: () => [mockPermission, jest.fn()],
  };
});

beforeEach(async () => {
  await AsyncStorage.clear();
  resetTestApi();
  jest.clearAllMocks();
  mockParams = {};
  mockPermission = { granted: true, canAskAgain: true };
});

describe('My jobs', () => {
  it('shows loading while the jobs are on their way', async () => {
    jest.spyOn(testApi.current, 'listMyJobs').mockReturnValueOnce(new Promise(() => {}));
    await renderScreen(<MyJobsScreen />);
    expect(screen.getByText('Loading your jobs…')).toBeOnTheScreen();
  });

  it('shows the open jobs', async () => {
    await renderScreen(<MyJobsScreen />);
    expect(await screen.findByText('Condenser fan 2 vibration high')).toBeOnTheScreen();
    expect(screen.getByText('Fire pump FP-1 fails to start on test')).toBeOnTheScreen();
  });

  it('shows the error with Try again', async () => {
    const spy = jest.spyOn(testApi.current, 'listMyJobs').mockRejectedValueOnce(new ApiError('The server is down for maintenance.'));
    await renderScreen(<MyJobsScreen />);
    expect(await screen.findByText('The server is down for maintenance.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Condenser fan 2 vibration high')).toBeOnTheScreen();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('says what to do when there are no jobs', async () => {
    jest.spyOn(testApi.current, 'listMyJobs').mockResolvedValueOnce([]);
    await renderScreen(<MyJobsScreen />);
    expect(await screen.findByText('No jobs for you right now')).toBeOnTheScreen();
  });

  it('shows the jobs saved on the phone when there is no signal', async () => {
    await loadMyJobs(testApi.current); // an earlier visit with signal saved a copy

    testApi.current.setOnline(false);
    await renderScreen(<MyJobsScreen />);
    expect(await screen.findByText(/No connection. Showing the jobs saved on this phone/)).toBeOnTheScreen();
    expect(screen.getByText('Condenser fan 2 vibration high')).toBeOnTheScreen();
  });

  it('tells the technician when there is no signal and nothing saved', async () => {
    testApi.current.setOnline(false);
    await renderScreen(<MyJobsScreen />);
    expect(await screen.findByText(/no jobs are saved on this phone yet/)).toBeOnTheScreen();
  });
});

describe('Job detail', () => {
  beforeEach(() => {
    mockParams = { id: 'WO-2291' };
  });

  it('warns when a reading is above the limit', async () => {
    await renderScreen(<JobDetailScreen />);
    expect(await screen.findByText('Above the 7.1 mm/s limit set for this asset type.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Fan 2 vibration (mm/s)'), '5.2');
    expect(screen.queryByText('Above the 7.1 mm/s limit set for this asset type.')).toBeNull();
  });

  it('keeps Complete job disabled, with the reason, until the checklist is done', async () => {
    await renderScreen(<JobDetailScreen />);
    const complete = await screen.findByRole('button', { name: 'Complete job' });
    expect(complete).toBeDisabled();
    expect(screen.getByText('Finish the checklist first: 3 of 5 steps are not done.')).toBeOnTheScreen();

    for (const step of ['Measure vibration after the fix', 'Check condenser coil for debris', 'Restore power and run for 10 minutes']) {
      await fireEvent.press(screen.getByRole('checkbox', { name: step }));
    }

    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete job' })).toBeEnabled());
    expect(screen.queryByText(/Finish the checklist first/)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Restore power and run for 10 minutes' })).toBeChecked();
  });

  it('saves changes on the phone and shows the offline banner when there is no signal', async () => {
    const { queue } = await renderScreen(<JobDetailScreen />);
    await screen.findByText('Condenser fan 2 vibration high');
    testApi.current.setOnline(false);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Measure vibration after the fix' }));

    expect(
      await screen.findByText('Offline: 1 change saved on this phone. They will be sent when you are back online.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Measure vibration after the fix' })).toBeChecked();
    expect(queue.getState().pending).toHaveLength(1);

    testApi.current.setOnline(true);
    await queue.flush((c) => testApi.current.send(c));
    await waitFor(() => expect(screen.queryByText(/Offline:/)).toBeNull());
  });
});

describe('Complete job', () => {
  it('completes a job whose checklist is done', async () => {
    mockParams = { id: 'WO-2291' };
    const api = testApi.current;
    for (const stepId of ['s3', 's4', 's5']) await api.send({ kind: 'checklist.set', jobId: 'WO-2291', stepId, done: true });

    await renderScreen(<CompleteJobScreen />);
    // The reading is above the limit: the technician is told the planner will see it.
    expect(await screen.findByText(/The planner will see this reading/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Complete job' }));

    expect(await screen.findByText('Job completed')).toBeOnTheScreen();
    await waitFor(async () => expect((await api.getJob('WO-2291'))?.state).toBe('completed'));
  });

  it('explains why a job cannot be completed yet', async () => {
    mockParams = { id: 'WO-2302' };
    await renderScreen(<CompleteJobScreen />);
    expect(await screen.findByText('Finish the checklist first: 2 of 2 steps are not done.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Complete job' })).toBeDisabled();
  });
});

describe('Scan', () => {
  it('finds an asset by its typed tag', async () => {
    await renderScreen(<ScanScreen />);
    expect(screen.getByRole('button', { name: 'Find asset' })).toBeDisabled();
    expect(screen.getByText('Type the code printed under the QR tag first.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Asset tag'), 'inv-00417');
    await fireEvent.press(screen.getByRole('button', { name: 'Find asset' }));

    expect(await screen.findByText('Chiller CH-2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open WO-2291: Condenser fan 2 vibration high' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/job/WO-2291');
  });

  it('looks up a scanned QR code', async () => {
    await renderScreen(<ScanScreen />);
    await fireEvent(screen.getByTestId('camera'), 'barcodeScanned', { type: 'qr', data: 'https://acme.inventra.app/a/INV-00102' });
    expect(await screen.findByText('Fire pump FP-1')).toBeOnTheScreen();
  });

  it('says when no asset has the tag', async () => {
    await renderScreen(<ScanScreen />);
    await fireEvent.changeText(screen.getByLabelText('Asset tag'), 'INV-99999');
    await fireEvent.press(screen.getByRole('button', { name: 'Find asset' }));
    expect(await screen.findByText(/No asset has the tag INV-99999/)).toBeOnTheScreen();
  });

  it('falls back to typing when camera access is off', async () => {
    mockPermission = { granted: false, canAskAgain: false };
    await renderScreen(<ScanScreen />);
    expect(screen.getByText(/Camera access is off for Inventra/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Asset tag')).toBeOnTheScreen();
  });
});
