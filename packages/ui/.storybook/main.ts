import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: (config) => ({
    ...config,
    build: {
      ...config.build,
      rollupOptions: {
        ...config.build?.rollupOptions,
        // O "use client" existe para o Next 15 (os componentes são consumidos
        // como fonte pelos dois fronts). O bundler do Storybook ignora a
        // diretiva e avisa a cada arquivo — ruído que esconderia aviso real.
        onwarn(warning, defaultHandler) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          defaultHandler(warning);
        },
      },
    },
  }),
};

export default config;
