import { openBrowserAsync } from 'expo-web-browser';
import { useMemo } from 'react';
import { Linking, Text as RNText, View } from 'react-native';
import { Renderer, useMarkdown } from 'react-native-marked';

import { useColor } from '@/lib/colors';

const REGULAR = 'DMSans_400Regular';
const BOLD = 'DMSans_700Bold';

/** Abre links http(s) no navegador in-app e os demais (mailto, tel) no app do sistema. */
export function openLink(url: string) {
    if (/^https?:/i.test(url)) void openBrowserAsync(url);
    else void Linking.openURL(url);
}

class LinkRenderer extends Renderer {
    override link(children: string | React.ReactNode[], href: string, styles?: object) {
        return (
            <RNText
                key={this.getKey()}
                accessibilityRole="link"
                style={styles}
                onPress={() => openLink(href)}
            >
                {children}
            </RNText>
        );
    }
}

/** Markdown das postagens (react-native-marked) com as cores do tema. */
export function Markdown({ children }: { children: string }) {
    const text = useColor('muted-foreground');
    const link = useColor('primary');
    const code = useColor('muted');
    const border = useColor('border');
    const renderer = useMemo(() => new LinkRenderer(), []);
    const elements = useMarkdown(children, {
        renderer,
        theme: { colors: { text, link, code, border } },
        // no RN cada peso da DM Sans é uma família
        styles: {
            text: { fontSize: 14, lineHeight: 22, fontFamily: REGULAR },
            strong: { fontSize: 14, lineHeight: 22, fontFamily: BOLD },
            em: { fontSize: 14, lineHeight: 22, fontFamily: REGULAR },
            li: { fontSize: 14, lineHeight: 22, fontFamily: REGULAR },
            link: { fontSize: 14, lineHeight: 22, fontFamily: REGULAR },
            h1: { fontFamily: BOLD },
            h2: { fontFamily: BOLD },
            h3: { fontFamily: BOLD },
            h4: { fontFamily: BOLD },
            h5: { fontFamily: BOLD },
            h6: { fontFamily: BOLD },
            paragraph: { marginVertical: 4 }
        }
    });

    return (
        <View>
            {elements.map((element, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- blocos sem id
                <View key={index}>{element}</View>
            ))}
        </View>
    );
}
