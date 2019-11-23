import Option from "../util/Option";
import CaretContainer from "../caret/CaretContainer";
import NodeType from "../dom/NodeType";
import TreeWalker from "../dom/TreeWalker";
import CaretContainer from "../care/CaretContainer";
import CaretPosition from "../caret/CaretPosition";

export default class NormalizeRange {
    static normalize(dom, rng) {
        let collapsed = rng.collapsed, normRng = rng.cloneRange(),
            startPos = CaretPosition.fromRangeStart(rng),
            isEq = (rng1, rng2) => {
                return rng1 && rng2
                    && (rng1.startContainer === rng2.startContainer && rng1.startOffset === rng2.startOffset)
                    && (rng1.endContainer === rng2.endContainer && rng1.endOffset === rng2.endOffset);
            };

        this.__normalizeEndPoint(dom, collapsed, true, normRng).each((pos) => {
            if (!collapsed || !CaretPosition.isAbove(startPos, pos)) {
                normRng.setStart(pos.container(), pos.offset());
            }
        });

        if (!collapsed) {
            this.__normalizeEndPoint(dom, collapsed, false, normRng).each((pos) => {
                normRng.setEnd(pos.container(), pos.offset());
            });
        }

        // If it was collapsed then make sure it still is
        if (collapsed) {
            normRng.collapse(true);
        }
        return isEq(rng, normRng) ? Option.none() : Option.some(normRng);
    }

    static __findParent(node, rootNode, predicate) {
        while (node && node !== rootNode) {
            if (predicate(node)) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    static __hasParent(node, rootNode, predicate) {
        return this.__findParent(node, rootNode, predicate) !== null;
    }

    static __hasParentWithName(node, rootNode, name) {
        return this.__hasParent(node, rootNode, (node) => {
            return node.nodeName === name;
        });
    }

    static __isTable(node) {
        return node && node.nodeName === "TABLE";
    }

    static __isTableCell(node) {
        return node && /^(TD|TH|CAPTION)$/.test(node.nodeName);
    }

    static __isCeFalseCaretContainer(node, rootNode) {
        return CaretContainer.isCaretContainer(node) && this.__hasParent(node, rootNode, isCaretNode) === false;
    }

    static __hasBrBeforeAfter(dom, node, left) {
        let walker = new TreeWalker(node, dom.getParent(node.parentNode, dom.isBlock) || dom.getRoot());
        while ((node = walker[left ? "prev" : "next"]())) {
            if (NodeType.isBr(node)) {
                return true;
            }
        }
    }

    static __isPrevNode(node, name) {
        return node.previousSibling && node.previousSibling.nodeName === name;
    }

    static __hasContentEditableFalseParent(body, node) {
        while (node && node !== body) {
            if (NodeType.isContentEditableFalse(node)) {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    }

    // Walks the dom left/right to find a suitable text node to move the endpoint into
    // It will only walk within the current parent block or body and will stop if it hits a block or a BR/IMG
    static __findTextNodeRelative(dom, isAfterNode, collapsed, left, startNode) {
        let walker, lastInlineElement, parentBlockContainer, body = dom.getRoot(), node,
            nonEmptyElementsMap = dom.schema.getNonEmptyElements();

        parentBlockContainer = dom.getParent(startNode.parentNode, dom.isBlock) || body;

        if (left && NodeType.isBr(startNode) && isAfterNode && dom.isEmpty(parentBlockContainer)) {
            return Option.some(new CaretPosition(startNode.parentNode, dom.nodeIndex(startNode)));
        }

        // Walk left until we hit a text node we can move to or a block/br/img
        walker = new TreeWalker(startNode, parentBlockContainer);
        while ((node = walker[left ? "prev" : "next"]())) {
            // Break if we hit a non content editable node
            if (dom.getContentEditableParent(node) === "false" || this.__isCeFalseCaretContainer(node, body)) {
                return Option.none();
            }

            // Found text node that has a length
            if (NodeType.isText(node) && node.nodeValue.length > 0) {
                if (this.__hasParentWithName(node, body, 'A') === false) {
                    return Option.some(new CaretPosition(node, left ? node.nodeValue.length : 0));
                }
                return Option.none();
            }

            // Break if we find a block or a BR/IMG/INPUT etc
            if (dom.isBlock(node) || nonEmptyElementsMap[node.nodeName.toLowerCase()]) {
                return Option.none();
            }
            lastInlineElement = node;
        }

        // Only fetch the last inline element when in caret mode for now
        if (collapsed && lastInlineElement) {
            return Option.some(new CaretPosition(lastInlineElement, 0));
        }

        return Option.none();
    }

    static __normalizeEndPoint(dom, collapsed, start, rng) {
        let container, offset, walker, body = dom.getRoot(), node, nonEmptyElementsMap,
            directionLeft, isAfterNode, normalized = false;

        container = rng[(start ? "start" : "end") + "Container"];
        offset = rng[(start ? "start" : "end") + "Offset"];
        isAfterNode = NodeType.isElement(container) && offset === container.childNodes.length;
        nonEmptyElementsMap = dom.schema.getNonEmptyElements();
        directionLeft = start;

        if (CaretContainer.isCaretContainer(container)) {
            return Option.none();
        }

        if (NodeType.isElement(container) && offset > container.childNodes.length - 1) {
            directionLeft = false;
        }

        // If the container is a document move it to the body element
        if (NodeType.isDocument(container)) {
            container = body;
            offset = 0;
        }

        // If the container is body try move it into the closest text node or position
        if (container === body) {
            // If start is before/after a image, table etc
            if (directionLeft) {
                node = container.childNodes[offset > 0 ? offset - 1 : 0];
                if (node) {
                    if (CaretContainer.isCaretContainer(node)) {
                        return Option.none();
                    }
                    if (nonEmptyElementsMap[node.nodeName] || this.__isTable(node)) {
                        return Option.none();
                    }
                }
            }

            // Resolve the index
            if (container.hasChildNodes()) {
                offset = Math.min(!directionLeft && offset > 0 ? offset - 1 : offset, container.childNodes.length - 1);
                container = container.childNodes[offset];
                offset = NodeType.isText(container) && isAfterNode ? container.data.length : 0;

                // Don"t normalize non collapsed selections like <p>[a</p><table></table>]
                if (!collapsed && container === body.lastChild && this.__isTable(container)) {
                    return Option.none();
                }

                if (this.__hasContentEditableFalseParent(body, container) || CaretContainer.isCaretContainer(container)) {
                    return Option.none();
                }

                // Don"t walk into elements that doesn"t have any child nodes like a IMG
                if (container.hasChildNodes() && this.__isTable(container) === false) {
                    // Walk the DOM to find a text node to place the caret at or a BR
                    node = container;
                    walker = new TreeWalker(container, body);
                    do {
                        if (NodeType.isContentEditableFalse(node) || CaretContainer.isCaretContainer(node)) {
                            normalized = false;
                            break;
                        }

                        // Found a text node use that position
                        if (NodeType.isText(node) && node.nodeValue.length > 0) {
                            offset = directionLeft ? 0 : node.nodeValue.length;
                            container = node;
                            normalized = true;
                            break;
                        }

                        // Found a BR/IMG/PRE element that we can place the caret before
                        if (nonEmptyElementsMap[node.nodeName.toLowerCase()] && !this.__isTableCell(node)) {
                            offset = dom.nodeIndex(node);
                            container = node.parentNode;
                            // Put caret after image and pre tag when moving the end point
                            if (!directionLeft) {
                                offset++;
                            }
                            normalized = true;
                            break;
                        }
                    } while ((node = (directionLeft ? walker.next() : walker.prev())));
                }
            }
        }

        // Lean the caret to the left if possible
        if (collapsed) {
            // So this: <b>x</b><i>|x</i>
            // Becomes: <b>x|</b><i>x</i>
            // Seems that only gecko has issues with this
            if (NodeType.isText(container) && offset === 0) {
                this.__findTextNodeRelative(dom, isAfterNode, collapsed, true, container).each((pos) => {
                    container = pos.container();
                    offset = pos.offset();
                    normalized = true;
                });
            }

            // Lean left into empty inline elements when the caret is before a BR
            // So this: <i><b></b><i>|<br></i>
            // Becomes: <i><b>|</b><i><br></i>
            // Seems that only gecko has issues with this.
            // Special edge case for <p><a>x</a>|<br></p> since we don"t want <p><a>x|</a><br></p>
            if (NodeType.isElement(container)) {
                node = container.childNodes[offset];
                // Offset is after the containers last child
                // then use the previous child for normalization
                if (!node) {
                    node = container.childNodes[offset - 1];
                }
                if (node && NodeType.isBr(node) && !this.__isPrevNode(node, "A") &&
                    !this.__hasBrBeforeAfter(dom, node, false) && !this.__hasBrBeforeAfter(dom, node, true)) {
                    this.__findTextNodeRelative(dom, isAfterNode, collapsed, true, node).each((pos) => {
                        container = pos.container();
                        offset = pos.offset();
                        normalized = true;
                    });
                }
            }
        }

        // Lean the start of the selection right if possible
        // So this: x[<b>x]</b>
        // Becomes: x<b>[x]</b>
        if (directionLeft && !collapsed && NodeType.isText(container) && offset === container.nodeValue.length) {
            this.__findTextNodeRelative(dom, isAfterNode, collapsed, false, container).each((pos) => {
                container = pos.container();
                offset = pos.offset();
                normalized = true;
            });
        }
        return normalized ? Option.some(new CaretPosition(container, offset)) : Option.none();
    };
}