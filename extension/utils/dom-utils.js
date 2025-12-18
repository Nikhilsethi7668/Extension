// utils/dom-utils.js

export const simulateInput = (element, value) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    ).set;
    nativeInputValueSetter.call(element, value);

    const event = new Event("input", { bubbles: true });
    element.dispatchEvent(event);
};

export const simulateTextAreaInput = (element, value) => {
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
    ).set;
    nativeTextAreaValueSetter.call(element, value);

    const event = new Event("input", { bubbles: true });
    element.dispatchEvent(event);
};

export const waitForElement = (selector, timeout = 10000) => {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        const observer = new MutationObserver((mutations) => {
            const el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
};
