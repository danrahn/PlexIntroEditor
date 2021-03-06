import { Log } from '../../Shared/ConsoleLog.js';
import ServerPausedOverlay from './ServerPausedOverlay.js';

/**
 * Removes all children from the given element.
 * @param {HTMLElement} ele The element to clear.
 */
 function clearEle(ele) {
    while (ele.firstChild) {
        ele.removeChild(ele.firstChild);
    }
}

/**
 * Generic method to make a request to the given endpoint that expects a JSON response.
 * @param {string} endpoint The URL to query.
 * @param {{[parameter: string]: any}} parameters URL parameters.
 * @param {(response: Object) => void} successFunc Callback function to invoke on success.
 * @param {(response: Object) => void} [failureFunc] Callback function to invoke on failure.
 */
function jsonRequest(endpoint, parameters, successFunc, failureFunc) {
    let url = new URL(endpoint, window.location.href);
    for (const [key, value] of Object.entries(parameters)) {
        url.searchParams.append(key, value);
    }

    fetch(url, { method : 'POST', headers : { accept : 'application/json' } }).then(r => r.json()).then(response => {
        Log.verbose(response, `Response from ${url}`);
        if (!response || response.Error) {

            // Global check to see if we failed because the server is suspended.
            // If so, show the undismissible 'Server Paused' overlay.
            if (response.Error && response.Error == 'Server is suspended') {
                Log.info('Action was not completed because the server is suspended.');
                ServerPausedOverlay.Show();
                return;
            }

            if (failureFunc) {
                failureFunc(response);
            } else {
                Log.error(response, 'Request failed');
            }

            return;
        }

        successFunc(response);
    }).catch(err => {
        if (failureFunc) {
            failureFunc(err);
        } else {
            Log.error(response, 'Request failed');
        }
    });
}

/**
 * Custom jQuery-like selector method.
 * If the selector starts with '#' and contains no spaces, return the result of `querySelector`,
 * otherwise return the result of `querySelectorAll`.
 * @param {DOMString} selector The selector to match.
 * @param {HTMLElement} ele The scope of the query. Defaults to `document`.
 */
function $(selector, ele=document) {
    if (selector.indexOf("#") === 0 && selector.indexOf(" ") === -1) {
        return $$(selector, ele);
    }

    return ele.querySelectorAll(selector);
}

/**
 * Like $, but forces a single element to be returned. i.e. querySelector.
 * @param {string} selector The query selector.
 * @param {HTMLElement} [ele=document] The scope of the query. Defaults to `document`.
 */
function $$(selector, ele=document) {
    return ele.querySelector(selector);
}

/**
 * Helper method to create DOM elements.
 * @param {string} type The TAG to create.
 * @param {{[attribute: string]: string}} [attrs] Attributes to apply to the element (e.g. class, id, or custom attributes).
 * @param {string|HTMLElement} [content] The inner content of the element, either a string or an element.
 * @param {{[event: string]: EventListener}} [events] Map of events (click/keyup/etc) to attach to the element.
 * @param {object} [options={}] Additional options 
 */
function buildNode(type, attrs, content, events, options={}) {
    let ele = document.createElement(type);
    return _buildNode(ele, attrs, content, events, options);
}

/**
 * Helper method to create DOM elements with the given namespace (e.g. SVGs).
 * @param {string} ns The namespace to create the element under.
 * @param {string} type The type of element to create.
 * @param {{[attribute: string]: string}} [attrs] Attributes to apply to the element (e.g. class, id, or custom attributes).
 * @param {string|HTMLElement} [content] The inner content of the element, either a string or an element.
 * @param {{[event: string]: EventListener}} [events] Map of events (click/keyup/etc) to attach to the element.
 */
function buildNodeNS(ns, type, attrs, content, events, options={}) {
    let ele = document.createElementNS(ns, type);
    return _buildNode(ele, attrs, content, events, options);
}

/**
 * "Private" core method for buildNode and buildNodeNS, that handles both namespaced and non-namespaced elements.
 * @param {HTMLElement} ele The HTMLElement to attach the given properties to.
 * @param {{[attribute: string]: string}} [attrs] Attributes to apply to the element (e.g. class, id, or custom attributes).
 * @param {string|HTMLElement} [content] The inner content of the element, either a string or an element.
 * @param {{[event: string]: EventListener}} [events] Map of events (click/keyup/etc) to attach to the element.
 * @param {object} [options]
 */
function _buildNode(ele, attrs, content, events, options) {
    if (attrs) {
        for (let [key, value] of Object.entries(attrs)) {
            ele.setAttribute(key, value);
        }
    }

    if (events) {
        for (let [event, func] of Object.entries(events)) {
            if (options.thisArg) {
                ele.addEventListener(event, func.bind(options.thisArg, ele));
            } else {
                ele.addEventListener(event, func);
            }
        }
    }

    if (content) {
        if (content instanceof HTMLElement) {
            ele.appendChild(content);
        } else {
            ele.innerHTML = content;
        }
    }

    return ele;
}

/**
 * Helper to append multiple children to a single element at once.
 * @param {HTMLElement} parent Parent element to append children to.
 * @param {...HTMLElement} elements Elements to append this this `HTMLElement`
 * @returns {HTMLElement} `parent`
 */
 function appendChildren(parent, ...elements) {
    for (let element of elements) {
        if (element) {
            parent.appendChild(element);
        }
    }

    return parent;
};


/**
 * Return an error string from the given error.
 * In almost all cases, `error` will be either a JSON object with a single `Error` field,
 * or an exception of type {@link Error}. Handle both of those cases, otherwise return a
 * generic error message.
 * @param {*} error
 * @returns {string}
 */
 function errorMessage(error) {
    if (error.Error) {
        return error.Error;
    }

    if (error instanceof Error) {
        Log.error(error);
        Log.error(error.stack ? error.stack : '(Unknown stack)');

        if (error instanceof TypeError && error.message == 'Failed to fetch') {
            // Special handling of what's likely a server-side exit.
            return error.toString() + '<br><br>The server may have exited unexpectedly, please check the console.';
        }

        return error.toString();
    }

    return 'I don\'t know what went wrong, sorry :(';
}

/**
 * Return 'n text' if n is 1, otherwise 'n texts'.
 * @param {number} n The number of items.
 * @param {string} text The type of item.
 */
function plural(n, text) {
    return `${n} ${text}${n == 1 ? '' : 's'}`;
}

/**
 * Pads 0s to the front of `val` until it reaches the length `pad`.
 * @param {number} val The value to pad.
 * @param {number} pad The minimum length of the string to return. */
function pad0(val, pad) {
    val = val.toString();
    return '0'.repeat(Math.max(0, pad - val.length)) + val;
}

/**
 * Convert milliseconds to a user-friendly [h:]mm:ss.000 string.
 * @param {number} ms */
function msToHms(ms) {
    let seconds = ms / 1000;
    const hours = parseInt(seconds / 3600);
    const minutes = parseInt(seconds / 60) % 60;
    seconds = parseInt(seconds) % 60;
    const thousandths = ms % 1000;
    let time = pad0(minutes, 2) + ":" + pad0(seconds, 2) + "." + pad0(thousandths, 3);
    if (hours > 0)
    {
        time = hours + ":" + time;
    }

    return time;
}

export { $, $$, appendChildren, buildNode, buildNodeNS, clearEle, errorMessage, jsonRequest, msToHms, pad0, plural };
