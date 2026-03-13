export default {
    server: {
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp"
        },
        open: '/partridge.html',
    },
    build: {
        rollupOptions: {
            input: {
                app: './partridge.html',
            },
        },
    },
}