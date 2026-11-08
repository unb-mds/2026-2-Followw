import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
    name: 'Followw',
    slug: 'followw',
    scheme: 'followw',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
        bundleIdentifier: 'app.followw.unb',
        supportsTablet: true
    },
    android: {
        package: 'app.followw.unb',
        adaptiveIcon: {
            backgroundColor: '#171717',
            foregroundImage: './assets/images/adaptive-icon.png'
        },
        predictiveBackGestureEnabled: true
    },
    web: {
        output: 'single',
        favicon: './assets/images/favicon.png'
    },
    plugins: [
        'expo-router',
        'expo-secure-store',
        'expo-localization',
        'expo-sharing',
        [
            'expo-splash-screen',
            {
                backgroundColor: '#ffffff',
                image: './assets/images/splash-icon.png',
                imageWidth: 120,
                dark: { backgroundColor: '#0a0a0a' }
            }
        ]
    ],
    experiments: {
        typedRoutes: true,
        reactCompiler: true
    }
};

export default config;
