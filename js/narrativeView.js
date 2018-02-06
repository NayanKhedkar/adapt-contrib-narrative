define([
    'core/js/adapt',
    'core/js/views/componentView'
], function(Adapt, ComponentView) {
    'use strict';
    
    const NarrativeView = ComponentView.extend({
        
        events: {
            'click .narrative-strapline-title': 'openPopup',
            'click .narrative-controls': 'onNavigationClicked',
            'click .narrative-indicators .narrative-progress': 'onProgressClicked'
        },

        preRender: function() {
            this.listenTo(Adapt, 'device:changed', this.reRender, this);
            this.listenTo(Adapt, 'device:resize', this.resizeControl, this);
            this.listenTo(Adapt, 'notify:closed', this.closeNotify, this);
            this.setDeviceSize();

            this.listenTo(this.model.get('_items'), {
                'change:_isActive': this.onItemsActiveChange
            });

            // Checks to see if the narrative should be reset on revisit
            this.checkIfResetOnRevisit();
            this._isInitial = true;
        },

        onItemsActiveChange: function(item, _isActive) {
            if (_isActive === true) {
                this.setStage(item);
            }
        },

        setDeviceSize: function() {
            if (Adapt.device.screenSize === 'large') {
                this.$el.addClass('desktop').removeClass('mobile');
                this.model.set('_isDesktop', true);
            } else {
                this.$el.addClass('mobile').removeClass('desktop');
                this.model.set('_isDesktop', false)
            }
        },

        postRender: function() {
            this.renderState();
            this.$('.narrative-slider').imageready(_.bind(function() {
                this.setReadyStatus();
            }, this));
            this.setupNarrative();
        },

        // Used to check if the narrative should reset on revisit
        checkIfResetOnRevisit: function() {
            var isResetOnRevisit = this.model.get('_isResetOnRevisit');
            
            // If reset is enabled set defaults
            if (isResetOnRevisit) {
                this.model.reset(isResetOnRevisit);
            }
        },

        setupNarrative: function() {
            this.setDeviceSize();
            if (!this.model.has('_items') || !this.model.get('_items').length) return;

            this.model.set('_active', true);
            
            let activeItem = this.model.getActiveItem();
            if (!activeItem) {
                activeItem = this.model.getItem(0);
                activeItem.toggleActive(true);
            } else {
                // manually trigger change as it is not fired on reentry
                this.model.get('_items').trigger('change:_isActive', activeItem, true);
            }

            this.calculateWidths();

            if (Adapt.device.screenSize !== 'large' && !this.model.get('_wasHotgraphic')) {
                this.replaceInstructions();
            }
            this.setupEventListeners();
            this._isInitial = false;
        },

        calculateWidths: function() {
            var slideWidth = this.$('.narrative-slide-container').width();
            var slideCount = this.model.get('_items').length;
            var marginRight = this.$('.narrative-slider-graphic').css('margin-right');
            var extraMargin = marginRight === '' ? 0 : parseInt(marginRight);
            var fullSlideWidth = (slideWidth + extraMargin) * slideCount;

            const direction = this.getSlideDirection();

            this.$('.narrative-slider-graphic').width(slideWidth);
            this.$('.narrative-strapline-header').width(slideWidth);
            this.$('.narrative-strapline-title').width(slideWidth);

            this.$('.narrative-slider').width(fullSlideWidth);
            this.$('.narrative-strapline-header-inner').width(fullSlideWidth);

            var stage = this.model.getActiveItem().get('_index');
            var margin = -(stage * slideWidth);

            this.$('.narrative-slider').css(('margin-' + direction), margin);
            this.$('.narrative-strapline-header-inner').css(direction, margin);

            this.model.set('_finalItemLeft', fullSlideWidth - slideWidth);
        },

        resizeControl: function() {
            var wasDesktop = this.model.get('_isDesktop');
            this.setDeviceSize();
            if (wasDesktop != this.model.get('_isDesktop')) this.replaceInstructions();
            this.calculateWidths();
            this.evaluateNavigation();
        },

        reRender: function() {
            if (this.model.get('_wasHotgraphic') && Adapt.device.screenSize == 'large') {
                this.replaceWithHotgraphic();
            } else {
                this.resizeControl();
            }
        },

        closeNotify: function() {
            this.evaluateCompletion()
        },

        replaceInstructions: function() {
            if (Adapt.device.screenSize === 'large') {
                this.$('.narrative-instruction-inner').html(this.model.get('instruction')).a11y_text();
            } else if (this.model.get('mobileInstruction') && !this.model.get('_wasHotgraphic')) {
                this.$('.narrative-instruction-inner').html(this.model.get('mobileInstruction')).a11y_text();
            }
        },

        replaceWithHotgraphic: function() {
            if (!Adapt.componentStore.hotgraphic) throw "Hotgraphic not included in build";
            var HotgraphicView = Adapt.componentStore.hotgraphic.view;
            
            var model = this.prepareHotgraphicModel();
            var newHotgraphic = new HotgraphicView({ model: model });
            var $container = $(".component-container", $("." + this.model.get("_parentId")));

            $container.append(newHotgraphic.$el);
            this.remove();
            $.a11y_update();
            _.defer(function() {
                Adapt.trigger('device:resize');
            });
        },

        prepareHotgraphicModel: function() {
            const model = this.model;
            model.resetActiveItems();
            model.set('_isPopupOpen', false);
            model.set('_component', 'hotgraphic');
            model.set('body', model.get('originalBody'));
            model.set('instruction', model.get('originalInstruction'));
            return model;
        },

        moveSliderToIndex: function(itemIndex, animate, callback) {
            var extraMargin = parseInt(this.$('.narrative-slider-graphic').css('margin-right'));
            var movementSize = this.$('.narrative-slide-container').width() + extraMargin;
            const direction = this.getSlideDirection();
            var marginDir = {};
            if (animate && !Adapt.config.get('_disableAnimation')) {
                marginDir['margin-' + direction] = -(movementSize * itemIndex);
                this.$('.narrative-slider').velocity("stop", true).velocity(marginDir);
                this.$('.narrative-strapline-header-inner').velocity("stop", true).velocity(marginDir, {complete:callback});
            } else {
                marginDir['margin-' + direction] = -(movementSize * itemIndex);
                this.$('.narrative-slider').css(marginDir);
                this.$('.narrative-strapline-header-inner').css(marginDir);
                callback();
            }
        },

        setStage: function(item) {
            var index = item.get('_index');
            if (this.model.get('_isDesktop')) {
                // Set the visited attribute for large screen devices
                item.toggleVisited(true);
            }

            this.$('.narrative-progress:visible').removeClass('selected').eq(index).addClass('selected');
            this.$('.narrative-slider-graphic').children('.controls').a11y_cntrl_enabled(false);
            this.$('.narrative-slider-graphic').eq(index).children('.controls').a11y_cntrl_enabled(true);
            this.$('.narrative-content-item').addClass('narrative-hidden').a11y_on(false).eq(index).removeClass('narrative-hidden').a11y_on(true);
            this.$('.narrative-strapline-title').a11y_cntrl_enabled(false).eq(index).a11y_cntrl_enabled(true);

            this.evaluateNavigation();
            this.evaluateCompletion();

            this.moveSliderToIndex(index, !this._isInitial, _.bind(function() {
                if (this.model.get('_isDesktop')) {
                    if (!this._isInitial) {
                        this.$('.narrative-content-item').eq(index).a11y_focus();
                    }
                } else {
                    if (!this._isInitial) {
                        this.$('.narrative-strapline-title').a11y_focus();
                    }
                }
            }, this));
        },

        evaluateNavigation: function() {
            var currentStage = this.model.getActiveItem().get('_index');
            var itemCount = this.model.get('_items').length;
            if (currentStage == 0) {
                this.$('.narrative-controls').addClass('narrative-hidden');

                if (itemCount > 1) {
                    this.$('.narrative-control-right').removeClass('narrative-hidden');
                }
            } else {
                this.$('.narrative-control-left').removeClass('narrative-hidden');

                if (currentStage == itemCount - 1) {
                    this.$('.narrative-control-right').addClass('narrative-hidden');
                } else {
                    this.$('.narrative-control-right').removeClass('narrative-hidden');
                }
            }
        },

        evaluateCompletion: function() {
            if (this.model.areAllItemsCompleted()) {
                this.trigger('allItems');
            } 
        },

        openPopup: function(event) {
            event && event.preventDefault();

            var currentItem = this.model.getActiveItem();

            // Set the visited attribute for small and medium screen devices
            currentItem.toggleVisited(true);

            Adapt.trigger('notify:popup', {
                title: currentItem.get('title'),
                body: currentItem.get('body')
            });
        },

        onNavigationClicked: function(event) {
            if (!this.model.get('_active')) return;

            var stage = this.model.getActiveItem().get('_index');
            var numberOfItems = this.model.get('_items').length;

            if ($(event.currentTarget).hasClass('narrative-control-right')) {
                stage++;
                this.model.setItemActive(stage);
            } else if ($(event.currentTarget).hasClass('narrative-control-left')) {
                stage--;
                this.model.setItemActive(stage);
            }
            stage = (stage + numberOfItems) % numberOfItems;
        },
        
        onProgressClicked: function(event) {
            event && event.preventDefault();
            var clickedIndex = $(event.target).index();
            this.model.setItemActive(clickedIndex);
        },

        inview: function(event, visible, visiblePartX, visiblePartY) {
            if (visible) {
                if (visiblePartY === 'top') {
                    this._isVisibleTop = true;
                } else if (visiblePartY === 'bottom') {
                    this._isVisibleBottom = true;
                } else {
                    this._isVisibleTop = true;
                    this._isVisibleBottom = true;
                }

                if (this._isVisibleTop && this._isVisibleBottom) {
                    this.$('.component-inner').off('inview');
                    this.setCompletionStatus();
                }
            }
        },

        setupEventListeners: function() {
            if (this.model.get('_setCompletionOn') === 'inview') {
                this.$('.component-widget').on('inview', _.bind(this.inview, this));
            }
        },

        remove: function() {
            if (this.model.get('_setCompletionOn') === 'inview') {
                this.$('.component-widget').off('inview');
            }
            ComponentView.prototype.remove.apply(this, arguments);
        },

        getSlideDirection: function() {
            let direction = 'left';
            if (Adapt.config.has('_defaultDirection') && Adapt.config.get('_defaultDirection') === 'rtl') {
                direction = 'right';
            }
            return direction;
        }

    });

    return NarrativeView;

});