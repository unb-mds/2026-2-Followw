import type { TestInstance } from 'test-renderer';

import { PortalHost } from '@rn-primitives/portal';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';

import { Dialog, DialogContent } from '@/components/ui/dialog';

jest.mock('lucide-react-native', () => ({ X: 'View' }));
jest.mock('@/components/ui/icon', () => ({ Icon: 'View' }));
jest.mock('@/components/ui/text', () => ({
    Text: require('react-native').Text,
    TextClassContext: require('react').createContext(undefined)
}));

async function renderDialog(onOpenChange = jest.fn()) {
    await render(
        <>
            <Dialog open onOpenChange={onOpenChange}>
                <DialogContent showCloseButton={false}>
                    <ScrollView testID="rolagem">
                        <ScrollView />
                    </ScrollView>
                </DialogContent>
            </Dialog>
            <PortalHost />
        </>
    );
    return onOpenChange;
}

// no Android, a view que assume o toque intercepta o arrasto e a rolagem dentro dela não anda
const claimsTouch = (node: TestInstance) =>
    node.props.onStartShouldSetResponder?.() === true ||
    node.props.onStartShouldSetResponderCapture?.() === true;

test('nenhuma view em volta da rolagem assume o toque', async () => {
    await renderDialog();
    let node = screen.getByTestId('rolagem').parent;
    while (node) {
        expect(claimsTouch(node)).toBe(false);
        node = node.parent;
    }
});

test('toque no fundo fecha o diálogo', async () => {
    const onOpenChange = await renderDialog();
    fireEvent.press(screen.getByTestId('dialog-backdrop', { includeHiddenElements: true }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
});
