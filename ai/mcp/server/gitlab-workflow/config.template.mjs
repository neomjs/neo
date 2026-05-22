import Config from '../../Config.mjs';

const aiConfig = Neo.create(Config, {
    data: {
        gitlabUrl: 'https://gitlab.com',
        token: process.env.GITLAB_TOKEN || ''
    }
});

export default aiConfig;
