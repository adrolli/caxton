function initCaxton( $, blocks, el, i18n, components ) {
	const editor = wp.editor;
	const __ = i18n.__;
	const registerBlockType = blocks.registerBlockType;

	const caxtonClone = obj => {
		var copy = {};
		for ( var ki in obj ) {
			if ( obj.hasOwnProperty( ki ) ) copy[ ki ] = obj[ ki ];
		}
		return copy;
	};

	const elementFromHTML = (html, props, tag) => {
		if ( ! props ) {
			props = {};
		}
		if ( ! tag ) {
			tag = 'div'
		}

		const _props = $.extend( {
			dangerouslySetInnerHTML: { __html: html },
		}, props );

		return el( tag, _props );
	};

	const HTMLFromElement = els => {
		let content = '';
		if ( els ) {
			if ( ! els.length ) {
				els = [els];
			}
			for ( let i = 0; i < els.length; i ++ ) {
				const node = els[i];
				switch ( typeof node ) {
					case 'object':
						content += wp.element.renderToString( node );
						break;
					default:
						content += node;
				}
			}
		}
		return content;
	};

	class CxB {
		constructor(block) {
			const th = this;
			if ( ! block.id ) {
				console.error( 'Parameter `id` is required for CaxtonBlock' )
			}
			this.block = $.extend( {
				title: block.id,
				icon: 'star-filled',
				category: 'layout',
				fields: {},
				attributes: {},
			}, block );

			th.tpl = block.tpl;
			if ( block.toolbars ) {
				block.fields = jQuery.extend( block.fields, block.toolbars )
			} else {
				block.toolbars = {};
			}
			th.fields = th.processFields( block.fields );
			th.sections = block.sections ? block.sections : {};
			th.sectionsFields = th.processSections( th.fields );
			th.toolbars = th.processFields( block.toolbars );

			th.registerBlock();
		}

		processFields(fields) {
			const ret = [];

			for ( const id in fields ) {
				if( fields.hasOwnProperty( id ) ) {
					const type = fields[id];
					let field = {};
					if ( typeof type === 'object' ) {
						field = type;
					} else {
						field.type = type;
					}
					field.id = id;
					field.label = field.label ? field.label : id;

					if ( field.type === 'checkbox' || field.type === 'toggle' ) {
						field.value = field.value || 1;
					}

					if ( ! field.default && isNaN( field.default ) ) {
						field.default = '';
					}
					if ( field.attr ) {
						this.block.attributes[id] = field.attr;
					} else {
						this.block.attributes[id] = {
							type: this.fieldAttrType( field ),
						};
					}
					ret.push( field );
				}
			}
			return ret;
		}

		fieldAttrType({type}) {
			const attrTypeByFieldType = {};

			if ( attrTypeByFieldType[ type ] ) {
				return attrTypeByFieldType[ type ];
			}

			return 'string';
		}

		processSections(fields) {
			const sections = {};

			for ( let i = 0; i < fields.length; i ++ ) {
				const section = fields[i].section;
				if ( section ) {
					if ( ! sections[ section ] ) {
						sections[ section ] = [];
					}
					sections[ section ].push( fields[i] )
				}
			}
			return sections;
		}

		// region Inspector Fields

		fieldProps(field, index) {
			const id = field.id;
			const that = this;
			const fieldProps = $.extend( {}, field );

			fieldProps.key = `${fieldProps.type}-${index}`;
			fieldProps.value = that.attrs[ id ];
			fieldProps.onChange = (val, moreValues) => {
				const attrs = {};
				attrs[ id ] = val;
				if ( field.type === 'checkbox' || field.type === 'toggle' ) {
					attrs[ id ] = val ? field.value : '';
				}

				that.focussedProps.setAttributes( attrs );

				if ( typeof field.onChange === 'function' ) {
					field.onChange( val, that, moreValues );
				}
			};

			delete fieldProps.id;
			delete fieldProps.type;
			return fieldProps;
		}

		imageFieldInit(field, index) {
			const props = this.fieldProps( field, index );
			if ( ! props.className ) {
				props.className = '';
			}

			let btnContent = __( 'Select image' );
			let removeBtn = null;

			if ( props.value ) {
				btnContent = [
					el( 'img', {src: props.value, key: 'image'} ),
					__( 'Click the image to edit or update' ),
				];
				removeBtn = el(
					'a', {
						className: 'caxton-remove-image',
						href: '#',
						onClick() {
							props.onChange( '', {} )
						},
					},
					el( 'i', {className: 'dashicons dashicons-no',} ),
					'Remove'
				);
			}

			props.className += ' caxton-image-picker';
			return el(
				components.BaseControl,
				props,
				el(
					editor.MediaUpload,
					{
						onSelect(media) {
							props.onChange( media.url, media );
						},
						type: 'image',
						value: props.value,
						label: props.label,
						render({open}) {
							return el( 'div', {},
								removeBtn,
								el( components.Button, {
										className: props.value ? 'image-button' : 'button button-large',
										onClick: open,
									},
									btnContent
								)
							);
						},
					}
				)
			);
		}

		colorFieldInit(field, index) {
			const panelChildren = [];
			const props = this.fieldProps( field, index );
			props.title = props.label;

			if ( props.initialOpen === undefined ) {
				props.initialOpen = props.value ? false : true;
			}

			panelChildren.push( el(
				editor.ColorPalette,
				props,
			) );

			if ( field.help ) {
				panelChildren.push( field.help );
			}

			// Show color preview
			props.colorValue = props.value;

			return el( components.PanelColor, props, panelChildren )
		}

		checkboxFieldInit(field, index) {
			const fieldProps = this.fieldProps( field, index );
			fieldProps.checked = !! this.attrs[ field.id ];
			return el( components.CheckboxControl, fieldProps );
		}

		radioFieldInit(field, index) {
			const fieldProps = this.fieldProps( field, index );
			fieldProps.selected = fieldProps.value;
			return el( components.RadioControl, fieldProps );
		}

		rangeFieldInit(field, index) {
			return el(
				components.RangeControl,
				this.fieldProps( field, index )
			)
		}

		selectFieldInit(field, index) {
			return el(
				components.SelectControl,
				this.fieldProps( field, index )
			)
		}

		orderedSelectFieldInit(field, index) {
			let opt;
			let optEl;
			const props = this.fieldProps( field, index );
			const delimiter = props.delimiter ? props.delimiter : ',';
			const selectedOptionsData = {};
			const selectedOptions = [];
			const availableOption = [];
			const controlValue = props.value ? props.value.split( delimiter ) : [];

			for ( var i = 0; i < props.options.length; i ++ ) {
				opt = props.options[i];
				optEl = el(
					'div',
					{
						className: 'caxton-orderedselect-option',
						'data-val': opt.value,
						key: `option-${opt.value}`,
					},
					(
						opt.image ? el( 'img', {src: opt.image} ) : null
					),
					opt.label
				);

				if ( typeof opt.value === 'number' ) {
					opt.value = opt.value.toString();
				}

				if ( !controlValue.includes(opt.value) ) {
					availableOption.push( optEl );
				} else {
					selectedOptionsData[ opt.value ] = opt;
				}
			}

			for ( var i = 0; i < controlValue.length; i ++ ) {
				opt = selectedOptionsData[controlValue[i]];
				optEl = el(
					'div',
					{
						className: 'caxton-orderedselect-option',
						'data-val': opt.value,
						key: `option-${opt.value}`,
					},
					(
						opt.image ? el( 'img', {src: opt.image} ) : null
					),
					opt.label
				);

				selectedOptions.push( optEl );
			}

			if ( ! selectedOptions.length ) {
				selectedOptions.push( el( 'span', {
					className: 'caxton-placeholder o70',
					key: 'placeholder',
				}, 'Please choose...' ) )
			}

			selectedOptions.push( el( 'i', {
				className: 'dashicons dashicons-arrow-down',
				key: 'down-arrow-icon',
			} ) );

			return el(
				components.BaseControl,
				props,
				el(
					'div',
					{
						className: 'caxton-orderedselect-wrap',
						key: 'orderedselect-wrap',
					},
					el( 'div', {
						className: 'caxton-orderedselect-selected',
						key: 'selected-options',
						onClick({target}) {
							let val;
							const $target = $( target );
							if ( $target.hasClass( 'caxton-orderedselect-option' ) ) {
								val = $target.attr( 'data-val' );
								controlValue.splice( controlValue.indexOf( val ), 1 );
								props.onChange( controlValue.join( delimiter ) );
							} else {
								$target.closest( '.caxton-orderedselect-wrap' ).toggleClass( 'caxton-orderedselect-open' );
							}
						},
					}, selectedOptions ),
					el( 'div', {
						className: 'caxton-orderedselect-available',
						key: 'available-options',
						onClick({target}) {
							let val;
							const $target = $( target );
							if ( $target.hasClass( 'caxton-orderedselect-option' ) ) {
								val = $target.attr( 'data-val' );
								controlValue.push( val );
								props.onChange( controlValue.join( delimiter ) );
							}
						},
					}, availableOption )
				),
			);
		}

		fontFieldInit(field, index) {
			if ( ! field.tpl ) {
				field.tpl = 'font-family: %s;';
			}
			const props = this.fieldProps( field, index );
			const onChange = props.onChange;
			props.onChange = val => {
				if ( !val.includes(',') ) {
					const link = $( "<link rel='stylesheet' class='caxton-google-font'>" );
					link.attr( "href", `http://fonts.googleapis.com/css?family=${val}` )
					$( 'body' ).append( link );
				}
				onChange( val );
			};
			props.options = caxton.fonts;
			return el(
				components.SelectControl,
				props
			)
		}

		textFieldInit(field, index) {
			return el(
				components.TextControl,
				this.fieldProps( field, index )
			)
		}

		textareaFieldInit(field, index) {
			return el(
				components.TextareaControl,
				this.fieldProps( field, index )
			)
		}

		toggleFieldInit(field, index) {
			const fieldProps = this.fieldProps( field, index );
			fieldProps.checked = !! this.attrs[ field.id ];
			return el( components.ToggleControl, fieldProps );
		}

		iconFieldInit(field, index) {
			const props = this.fieldProps( field, index );
			const that = this;
			const defaultIcons = [];
			props.title = props.label;

			props.className = 'caxton-icon-picker-panel';

			for ( let i = 0; i < 100; i ++ ) {
				const ico = caxton.fontAwesome[i];
				defaultIcons.push( el( 'i', {className: `fas fa-${ico.n}`, key: ico.n, title: ico.n.replace( ' fab', '' ) } ) );
			}
			defaultIcons.push( el( 'p', {key: 'helptext'}, 'Search icons for more from all Font Awesome icons' ) );

			return el(
				components.PanelBody,
				props,
				el( 'div', {
						className: 'caxton-icon-picker',
						onClick({target}) {
							if ( target.tagName === 'I' ) {
								props.onChange( ` ${target.className.replace( ' o-70', '' )}` );
							}
						}
					},
					el( 'input', {
						type: 'text',
						placeholder: __( 'Search icons', 'caxton' ),
						onKeyUp({target}) {
							let searchTerm = target.value;
							let iconsMatched = 0;
							let $wrp;
							searchTerm = searchTerm.toLowerCase();
							$wrp = $( target ).siblings( '.caxton-matching-icons' );
							$wrp.html( '' );
							for ( let i = 0; iconsMatched < 50 && i < caxton.fontAwesome.length; i ++ ) {
								const ico = caxton.fontAwesome[i];
								if ( ico.n.includes(searchTerm) ) {
									iconsMatched ++;
									$wrp.append( `<i class="fas fa-${ico.n}"></i>` )
								} else if ( iconsMatched < 34 && ico.s.includes(searchTerm) ) {
									iconsMatched ++;
									$wrp.append( `<i class="fas fa-${ico.n} o-70"></i>` )
								}
							}
						}
					} ),
					el( 'span', {
						className: 'dashicons dashicons-search',
						title: __( 'Search', 'caxton' ),
					} ),
					el( 'span', {
						className: 'dashicons dashicons-no',
						title: __( 'Remove icon', 'caxton' ),
						style: {
							cursor: 'pointer',
							display: props.value ? 'block' : 'none',
						},
						onClick() {
							props.onChange( '' );
						}
					} ),
					el( 'div', {
						className: 'caxton-matching-icons',
						onClick({target}) {
							if ( target.tagName === 'I' ) {
								props.onChange( ` ${target.className.replace( ' o-70', '' )}` );
							}
						}
					}, defaultIcons )
				)
			);
		}

		positionFieldInit(field, index) {
			const fieldProps = this.fieldProps( field, index );
			fieldProps.selected = fieldProps.value;
			fieldProps.options = [
				//			{value: 'left top', label: 'Left top',},
				{value: 'center top', label: 'Top',},
				//			{value: 'right top', label: 'Right top',},
				//			{value: 'left center', label: 'Left center',},
				{value: '', label: 'Center',},
				//			{value: 'right center', label: 'Right center',},
				//			{value: 'left bottom', label: 'Left bottom',},
				{value: 'center bottom', label: 'Bottom',},
				//			{value: 'right bottom', label: 'Right bottom',},
			]
			return el( components.RadioControl, fieldProps );
		}

		AlignmentToolbarInit(field, index) {
			const props = this.fieldProps( field, index );

			props.controls = [
				{
					icon: 'editor-alignleft',
					title: __( 'Align left' ),
					isActive: props.value === ' tl',
					onClick() {
						props.onChange( ' tl' );
					}
				},
				{
					icon: 'editor-aligncenter',
					title: __( 'Align center' ),
					isActive: props.value === ' tc',
					onClick() {
						props.onChange( ' tc' );
					}
				},
				{
					icon: 'editor-alignright',
					title: __( 'Align right' ),
					isActive: props.value === ' tr',
					onClick() {
						props.onChange( ' tr' );
					}
				},
			];
			props.wideControlsEnabled = true;

			return el(
				components.Toolbar,
				props
			)
		}

		BlockWidthToolbarInit(field, index) {
			const props = this.fieldProps( field, index );

			props.controls = [
				{
					icon: 'align-center',
					title: __( 'Default' ),
					isActive: ! props.value,
					onClick() {
						props.onChange( '' );
					}
				},
				{
					icon: 'align-wide',
					title: __( 'Wide width' ),
					isActive: props.value === ' vw-100-bg',
					onClick() {
						props.onChange( ' vw-100-bg' );
					}
				},
				{
					icon: 'align-full-width',
					title: __( 'Full width' ),
					isActive: props.value === ' vw-100',
					onClick() {
						props.onChange( ' vw-100' );
					}
				},
			];
			props.wideControlsEnabled = true;

			return el(
				components.Toolbar,
				props
			)
		}

		BlockAlignToolbarInit(field, index) {
			const props = this.fieldProps( field, index );

			props.controls = [
				{
					icon: 'align-left',
					title: __( 'Align left' ),
					isActive: props.value === ' fl',
					onClick() {
						props.onChange( ' fl' );
					}
				},
				{
					icon: 'align-center',
					title: __( 'Align center' ),
					isActive: ! props.value,
					onClick() {
						props.onChange( '' );
					}
				},
				{
					icon: 'align-right',
					title: __( 'Align right' ),
					isActive: props.value === ' rl',
					onClick() {
						props.onChange( ' rl' );
					}
				},
			];
			props.wideControlsEnabled = true;

			return el(
				components.Toolbar,
				props
			)
		}

		// endregion

		renderPanel(id) {
			const fields = this.fields;
			let panelProps = {};
			let panelFields;
			const th = this;

			if ( th.sections[id] ) {
				panelProps = th.sections[id];
			}

			panelProps = $.extend( panelProps, {
				title: id,
				className: '',
				key: `CaxtonPanel${id}`,
				initialOpen: false,
			} );

			panelProps.className += `caxton-section caxton-section-${id.toLowerCase().replace( /[^0-z]/g, '-' )}`;

			panelFields = th.renderFields( th.sectionsFields[id], id );

			return el( components.PanelBody, panelProps, panelFields );
		}

		renderFields(fields, section, functionSuffix) {
			const els = [];
			const panelsRenderd = [];

			if ( ! functionSuffix ) {
				functionSuffix = 'FieldInit';
			}

			for ( let i = 0; i < fields.length; i ++ ) {
				const f = fields[i];
				let func;

				if ( functionSuffix.includes('Toolbar') ) {
					f['type'] = f['type'].replace( 'Toolbar', '' )
				}

				func = f['type'] + functionSuffix;

				if ( typeof this[ func ] === 'function' ) {
					if ( ! f.hide ) {
						if ( ! section ) {
							if ( ! f.section ) {
								els.push( this[func]( f, i ) );
							} else if ( !panelsRenderd.includes(f.section) ) {
								panelsRenderd.push( f.section );
								els.push( this.renderPanel( f.section ) );
							}
						} else if ( f.section == section ) {
							els.push( this[func]( f, i ) );
						}
					}
				} else if ( !f['type'].includes('Toolbar') ) {
					console.error( `${functionSuffix.replace( 'Init', '' )} ${f['id']} of type ${f['type']} and callback ${func} not supported.` );
				}
			}
			return els;
		}

		toolbarElements() {
			const els = this.renderFields( this.toolbars, false, 'ToolbarInit' );

			if ( els.length ) {
				return el(
					editor.BlockControls,
					{ key: 'toolbars' },
					els
				);
			}
		}

		inspectorFields() {
			const fields = this.fields;
			const panelProps = {};
			let panelFields;
			let els = [];
			const th = this;

			els = els.concat( th.renderFields( fields ) );

			if ( els && els.length ) {
				return el(
					editor.InspectorControls,
					{ key: 'inspector' },
					els
				);
			}
		}

		// region Register block

		populateFields(html, edit) {
			if ( ! html ) {
				return '';
			}
			let c2e;
			let tag;
			for ( let f in this.fields ) {
				if ( this.fields.hasOwnProperty( f ) ) {
					let _val;
					const fld = this.fields[ f ];
					let val = _val = this.attrs[fld.id];
					if ( fld.type === 'editable' ) {
						tag = fld.tag ? fld.tag : 'span';
						if ( edit ) {
							if ( val === fld.default ) {
								val = `<${tag} class="default">${val}</${tag}>`;
							}
							c2e = __( 'Click to Edit' );
							val =
								`<${tag} contentEditable="true" title="${c2e}" data-editableproperty="${fld.id}">${val}</${tag}>`;
						} else {
							if ( val ) {
								val = `<${tag}>${val}</${tag}>`;
							}
						}
					}
					if ( ( val || typeof val === 'number' ) && fld.tpl ) {
						val = fld.tpl.replace( /%s/g, val );
					}
					html = html.split( `{{_${fld.id}}}` ).join( _val );
					html = html.split( `{{${fld.id}}}` ).join( val );
				}
			}

			return html;
		}

		outputHTML(html, edit) {
			html = this.populateFields( html, edit );
			html = this.populateFields( html, edit ); // Twice to allow using dynamic fields in
			return { __html: html };
		}

		edit(props) {
			const that = this;
			if ( this.block ) {
				if ( typeof this.block.edit === 'function' ) {
					return this.block.edit( props, that );
				}
				return el( 'div', {
					key: 'block',
					dangerouslySetInnerHTML: this.outputHTML( this.tpl, 'edit' ),
					onClick(e) {
						e.preventDefault();
					},
					onKeyDown({target}) {
						const $def = $( target ).find( '.default' );
						if ( $def.length ) $def.remove();
					},
					onBlur({target}) {
						const $t = $( target );
						const attrs = {};
						const prop = $t.data( 'editableproperty' );
						attrs[prop] = $t.html();
						that.focussedProps.setAttributes( attrs );
					},
				} );
			}
		}

		save(props) {
			const id = this.block.id;
			if ( this.block ) {
				if ( typeof this.block.save === 'function' ) {
					return this.block.save( props, this );
				}
				return el( 'div', {dangerouslySetInnerHTML: this.outputHTML( this.tpl )} );
			}
		}

		saveBlockProperties(props) {
			this.props = props;
			this.attrs = this.props.attributes;
			for ( let f in this.fields ) {
				if ( this.fields.hasOwnProperty( f ) ) {
					const fld = this.fields[ f ];
					if ( isNaN( this.attrs[fld.id] ) && ! this.attrs[fld.id] ) this.attrs[fld.id] = fld.default
				}
			}
		}

		registerBlock() {
			let attrName;
			const that = this;
			const block = this.block;
			const registerBlockProps = $.extend( {}, block );
			if ( block.icon.includes('<svg') ) {
				const $icon = jQuery( block.icon );
				const props = {};
				$.each( $icon[0].attributes, function () {
					if ( this.specified ) {
						attrName = this.name.replace(/[-:]([a-z])/g, g => g[1].toUpperCase());
						props[attrName] = this.value;
					}
				} );
				props.height = 20;
				props.width = 20;
				block.icon = elementFromHTML( $icon.html(), props, 'svg' );
			}

			delete registerBlockProps.fields;
			delete registerBlockProps.tpl;
			delete registerBlockProps.id;

			registerBlockProps.icon = block.icon;

			const editCallback = function ( props ) {

				const els = [];
				that.saveBlockProperties( props );

				if ( typeof that.block.beforeEdit === 'function' ) {
					const beforeCallback = that.block.beforeEdit( props, this );
					if ( beforeCallback ) {
						els.push( beforeCallback );
					}
				}

				if ( props.isSelected ) {
					that.focussedProps = props;
					els.push( that.inspectorFields() );
					els.push( that.toolbarElements() );
				}

				els.push( that.edit( props ) );

				if ( typeof that.block.afterEdit === 'function' ) {
					const afterCallback = that.block.afterEdit( props, this );
					if ( afterCallback ) {
						els.push( afterCallback );
					}
				}

				return el( 'div', {}, els );
			};

			registerBlockProps.edit = editCallback;

			registerBlockProps.getEditWrapperProps = function( attributes ) {
				let attrs = {};
				const layout = attributes.Layout;
				let float = attributes.BlockAlignment;

				float = float ? float : attributes['Block Alignment'];

				if ( layout ) {
					attrs['caxton-layout'] = layout;
				}
				if ( float ) {
					const floatMaps = {
						' fl': 'left',
						' rl': 'right',
					};
					attrs['data-align'] = floatMaps[ float ];
				}

				if ( typeof block.registerBlockProps === 'function' ) {
					attrs = jQuery.extend( block.registerBlockProps( attributes, that ), attrs );
				}

				if ( typeof that.block.wrapperProps === 'function' ) {
					attrs = that.block.wrapperProps( attrs, attributes, this );
				}

				return attrs;
			};

			registerBlockProps.save = props => {
				that.saveBlockProperties( props );
				return that.save( props );
			};

			if ( 'function' === typeof block.apiCallback ) {
				if ( 'function' !== typeof block.apiUrl ) {
					block.apiUrl = () => (
						{
							apiData: block.apiUrl,
						}
					);
				}
				that.block.edit = block.apiCallback;

				class CaxtonAPIDataComponent extends React.Component {
					constructor( props ) {
						super( ...arguments );
						this.state = {
							dataProps: caxtonClone( props ),
							block: block,
							editCallback: editCallback,
						};
					}
					componentDidMount() {
						this.fetchUrls();
					}
					componentDidUpdate( prevProps, prevState ) {
						this.state.dataProps = caxtonClone( this.props );
						this.fetchUrls();
					}

					fetchUrls() {
						let
							props = this.state.dataProps,
							urls = this.state.block.apiUrl( this.props );

						for ( const dataKey in urls ) {
							if ( urls.hasOwnProperty( dataKey ) ) {
								if ( ! props[dataKey] ) {
									props[dataKey] = {};
								}
								wp.apiFetch( {path: urls[dataKey]} ).then( data => {
									if ( props[dataKey].data !== data ) {
										props[dataKey].data = data;
										this.setState( this.state );
									}
								} );
							}
						}
					}

					render() {
						this.fetchUrls();
						return this.state.editCallback( this.state.dataProps );
					}
				}

				registerBlockProps.edit = CaxtonAPIDataComponent;
				registerBlockProps.save = () => null;
			}

			if ( !block.id.includes('/') ) {
				block.id = `caxton/${block.id}`;
			}

			registerBlockType( block.id, registerBlockProps );
		}
	}

	CxB.prototype.orderedselectFieldInit = CxB.prototype.orderedSelectFieldInit;

	// endregion Register block

	window.CaxtonBlock = block => new CxB( block );

	window.Caxton = {
		el2html: HTMLFromElement,
		html2el: elementFromHTML
	};
}

initCaxton( jQuery, wp.blocks, wp.element.createElement, window.wp.i18n, wp.components );

jQuery( $ => {
	setTimeout( () => {
		if ( typeof ajaxurl !== 'string' ) return;
		let blk;
		let icon;
		const blocksData = wp.data.select( 'core/blocks' ).getBlockTypes();
		const blocks = {};
		for ( let i = 0; i < blocksData.length; i ++ ) {
			blk = blocksData[i];
			icon = blk.icon.src;
			if ( typeof icon === 'object' ) {
				icon = Caxton.el2html( icon );
			} else {
				icon = `<span class="dashicons dashicons-${icon}"></span>`;
			}
			blocks[blk.name] = {
				title: blk.title,
				icon,
				category: blk.category,
			};
		}

		$.post(
			ajaxurl,
			{
				action: 'caxton_save_blocks',
				blocks: JSON.stringify( blocks ),
			}
		);
	}, 2500 );
} );


caxton.fontAwesome = [
	{"n":"youtube-square fab","s":"youtube square"},{"n":"youtube fab","s":"audio-video,youtube"},{"n":"yoast fab","s":"yoast"},{"n":"yen-sign","s":"currency,yen sign"},{"n":"yelp fab","s":"yelp"},{"n":"yandex-international fab","s":"yandex international"},{"n":"yandex fab","s":"yandex"},{"n":"yahoo fab","s":"yahoo logo"},{"n":"y-combinator fab","s":"y combinator"},{"n":"xing-square fab","s":"xing square"},{"n":"xing fab","s":"xing"},{"n":"xbox fab","s":"xbox"},{"n":"x-ray","s":"medical,x-ray"},{"n":"wrench","s":"maps,objects,wrench"},{"n":"wpforms fab","s":"wpforms"},{"n":"wpexplorer fab","s":"wpexplorer"},{"n":"wpbeginner fab","s":"wpbeginner"},{"n":"wordpress-simple fab","s":"wordpress simple"},{"n":"wordpress fab","s":"wordpress logo"},{"n":"won-sign","s":"currency,won sign"},{"n":"wine-glass","s":"maps,objects,moving,wine glass"},{"n":"windows fab","s":"windows"},{"n":"window-restore","s":"code,window restore"},{"n":"window-minimize","s":"code,window minimize"},{"n":"window-maximize","s":"code,window maximize"},{"n":"window-close","s":"code,window close"},{"n":"wikipedia-w fab","s":"wikipedia w"},{"n":"wifi","s":"maps,communication,interfaces,wifi"},{"n":"whmcs fab","s":"whmcs"},{"n":"wheelchair","s":"maps,objects,accessibility,health,vehicles,users-people,wheelchair"},{"n":"whatsapp-square fab","s":"what's app square"},{"n":"whatsapp fab","s":"what's app"},{"n":"weixin fab","s":"weixin (wechat)"},{"n":"weight","s":"medical,weight"},{"n":"weibo fab","s":"weibo"},{"n":"warehouse","s":"logistics,warehouse"},{"n":"vuejs fab","s":"vue.js"},{"n":"volume-up","s":"audio-video,volume-up"},{"n":"volume-off","s":"audio-video,volume-off"},{"n":"volume-down","s":"audio-video,volume-down"},{"n":"volleyball-ball","s":"sports,volleyball ball"},{"n":"vnv fab","s":"vnv"},{"n":"vk fab","s":"vk"},{"n":"vine fab","s":"vine"},{"n":"vimeo-v fab","s":"vimeo"},{"n":"vimeo-square fab","s":"vimeo square"},{"n":"vimeo fab","s":"vimeo"},{"n":"video-slash","s":"chat,video slash"},{"n":"video","s":"audio-video,chat,video"},{"n":"viber fab","s":"viber"},{"n":"vials","s":"medical,vials"},{"n":"vial","s":"medical,vial"},{"n":"viadeo-square fab","s":"viadeo square"},{"n":"viadeo fab","s":"viadeo"},{"n":"viacoin fab","s":"viacoin"},{"n":"venus-mars","s":"gender,venus mars"},{"n":"venus-double","s":"gender,venus double"},{"n":"venus","s":"gender,venus"},{"n":"vaadin fab","s":"vaadin"},{"n":"utensils","s":"maps,objects,utensils"},{"n":"utensil-spoon","s":"maps,objects,utensil spoon"},{"n":"ussunnah fab","s":"us-sunnah foundation"},{"n":"users","s":"users-people,users"},{"n":"user-times","s":"users-people,remove user"},{"n":"user-secret","s":"code,users-people,user secret"},{"n":"user-plus","s":"users-people,add user"},{"n":"user-md","s":"health,medical,users-people,user-md"},{"n":"user-circle","s":"interfaces,users-people,user circle"},{"n":"user","s":"interfaces,users-people,user"},{"n":"usb fab","s":"usb"},{"n":"upload","s":"interfaces,arrows,computers,upload"},{"n":"untappd fab","s":"untappd"},{"n":"unlock-alt","s":"objects,status,alternate unlock"},{"n":"unlock","s":"objects,status,unlock"},{"n":"unlink","s":"editors,unlink"},{"n":"university","s":"maps,objects,university"},{"n":"universal-access","s":"accessibility,universal access"},{"n":"uniregistry fab","s":"uniregistry"},{"n":"undo-alt","s":"editors,interfaces,audio-video,arrows,alternate undo"},{"n":"undo","s":"editors,interfaces,audio-video,arrows,undo"},{"n":"underline","s":"editors,underline"},{"n":"umbrella","s":"maps,objects,umbrella"},{"n":"uikit fab","s":"uikit"},{"n":"uber fab","s":"uber"},{"n":"typo3 fab","s":"typo3"},{"n":"twitter-square fab","s":"twitter square"},{"n":"twitter fab","s":"twitter"},{"n":"twitch fab","s":"twitch"},{"n":"tv","s":"objects,computers,television"},{"n":"tumblr-square fab","s":"tumblr square"},{"n":"tumblr fab","s":"tumblr"},{"n":"tty","s":"maps,accessibility,communication,tty"},{"n":"truck-moving","s":"moving,truck moving"},{"n":"truck-loading","s":"moving,truck loading"},{"n":"truck","s":"maps,objects,vehicles,logistics,truck"},{"n":"trophy","s":"maps,objects,payments-shopping,interfaces,trophy"},{"n":"tripadvisor fab","s":"tripadvisor"},{"n":"trello fab","s":"trello"},{"n":"tree","s":"maps,objects,tree"},{"n":"trash-alt","s":"objects,editors,interfaces,alternate trash"},{"n":"trash","s":"objects,editors,interfaces,trash"},{"n":"transgender-alt","s":"gender,alternate transgender"},{"n":"transgender","s":"gender,transgender"},{"n":"train","s":"maps,objects,vehicles,train"},{"n":"trademark","s":"business,trademark"},{"n":"toggle-on","s":"interfaces,status,toggle on"},{"n":"toggle-off","s":"interfaces,status,toggle off"},{"n":"tint","s":"maps,design,images,tint"},{"n":"times-circle","s":"interfaces,times circle"},{"n":"times","s":"interfaces,times"},{"n":"ticket-alt","s":"maps,objects,alternate ticket"},{"n":"thumbtack","s":"maps,objects,business,writing,thumbtack"},{"n":"thumbs-up","s":"payments-shopping,interfaces,hands,status,thumbs-up"},{"n":"thumbs-down","s":"payments-shopping,interfaces,hands,status,thumbs-down"},{"n":"thermometer-three-quarters","s":"status,thermometer 3/4 full"},{"n":"thermometer-quarter","s":"status,thermometer 1/4 full"},{"n":"thermometer-half","s":"status,thermometer 1/2 full"},{"n":"thermometer-full","s":"status,thermometer full"},{"n":"thermometer-empty","s":"status,thermometer empty"},{"n":"thermometer","s":"medical,thermometer"},{"n":"themeisle fab","s":"themeisle"},{"n":"th-list","s":"editors,th-list"},{"n":"th-large","s":"editors,th-large"},{"n":"th","s":"editors,th"},{"n":"text-width","s":"editors,arrows,text-width"},{"n":"text-height","s":"editors,arrows,text-height"},{"n":"terminal","s":"code,terminal"},{"n":"tencent-weibo fab","s":"tencent weibo"},{"n":"telegram-plane fab","s":"telegram plane"},{"n":"telegram fab","s":"telegram"},{"n":"taxi","s":"maps,objects,vehicles,taxi"},{"n":"tasks","s":"business,editors,tasks"},{"n":"tape","s":"moving,tape"},{"n":"tags","s":"maps,objects,business,payments-shopping,tags"},{"n":"tag","s":"maps,objects,business,payments-shopping,tag"},{"n":"tachometer-alt","s":"objects,alternate tachometer"},{"n":"tablets","s":"medical,tablets"},{"n":"tablet-alt","s":"objects,computers,alternate tablet"},{"n":"tablet","s":"objects,computers,tablet"},{"n":"table-tennis","s":"sports,table tennis"},{"n":"table","s":"business,editors,table"},{"n":"syringe","s":"medical,syringe"},{"n":"sync-alt","s":"editors,interfaces,audio-video,arrows,alternate sync"},{"n":"sync","s":"editors,interfaces,spinners,audio-video,arrows,sync"},{"n":"supple fab","s":"supple"},{"n":"superscript","s":"editors,superscript"},{"n":"superpowers fab","s":"superpowers"},{"n":"sun","s":"objects,spinners,sun"},{"n":"suitcase","s":"maps,objects,business,moving,suitcase"},{"n":"subway","s":"maps,objects,vehicles,subway"},{"n":"subscript","s":"editors,subscript"},{"n":"stumbleupon-circle fab","s":"stumbleupon circle"},{"n":"stumbleupon fab","s":"stumbleupon logo"},{"n":"studiovinari fab","s":"studio vinari"},{"n":"stripe-s fab","s":"payments-shopping,stripe s"},{"n":"stripe fab","s":"payments-shopping,stripe"},{"n":"strikethrough","s":"editors,strikethrough"},{"n":"street-view","s":"maps,users-people,street view"},{"n":"strava fab","s":"strava"},{"n":"stopwatch","s":"objects,date-time,stopwatch"},{"n":"stop-circle","s":"audio-video,stop circle"},{"n":"stop","s":"audio-video,stop"},{"n":"sticky-note","s":"objects,business,writing,files,sticky note"},{"n":"sticker-mule fab","s":"sticker mule"},{"n":"stethoscope","s":"health,medical,stethoscope"},{"n":"step-forward","s":"audio-video,step-forward"},{"n":"step-backward","s":"audio-video,step-backward"},{"n":"steam-symbol fab","s":"steam symbol"},{"n":"steam-square fab","s":"steam square"},{"n":"steam fab","s":"steam"},{"n":"staylinked fab","s":"staylinked"},{"n":"star-half","s":"interfaces,star-half"},{"n":"star","s":"objects,payments-shopping,interfaces,shapes,star"},{"n":"stack-overflow fab","s":"stack overflow"},{"n":"stack-exchange fab","s":"stack exchange"},{"n":"square-full","s":"chess,square full"},{"n":"square","s":"shapes,square"},{"n":"spotify fab","s":"spotify"},{"n":"spinner","s":"spinners,spinner"},{"n":"speakap fab","s":"speakap"},{"n":"space-shuttle","s":"objects,vehicles,space shuttle"},{"n":"soundcloud fab","s":"soundcloud"},{"n":"sort-up","s":"interfaces,arrows,sort up (ascending)"},{"n":"sort-numeric-up","s":"interfaces,arrows,sort numeric up"},{"n":"sort-numeric-down","s":"interfaces,arrows,sort numeric down"},{"n":"sort-down","s":"interfaces,arrows,sort down (descending)"},{"n":"sort-amount-up","s":"interfaces,arrows,sort amount up"},{"n":"sort-amount-down","s":"interfaces,arrows,sort amount down"},{"n":"sort-alpha-up","s":"interfaces,arrows,sort alpha up"},{"n":"sort-alpha-down","s":"interfaces,arrows,sort alpha down"},{"n":"sort","s":"interfaces,arrows,sort"},{"n":"snowflake","s":"objects,spinners,snowflake"},{"n":"snapchat-square fab","s":"snapchat square"},{"n":"snapchat-ghost fab","s":"snapchat ghost"},{"n":"snapchat fab","s":"snapchat"},{"n":"smoking","s":"medical,smoking"},{"n":"smile","s":"interfaces,chat,users-people,smile"},{"n":"slideshare fab","s":"slideshare"},{"n":"sliders-h","s":"interfaces,images,horizontal sliders"},{"n":"slack-hash fab","s":"slack hashtag"},{"n":"slack fab","s":"slack logo"},{"n":"skype fab","s":"skype"},{"n":"skyatlas fab","s":"skyatlas"},{"n":"sitemap","s":"code,business,interfaces,sitemap"},{"n":"sistrix fab","s":"sistrix"},{"n":"simplybuilt fab","s":"simplybuilt"},{"n":"signal","s":"interfaces,signal"},{"n":"sign-out-alt","s":"interfaces,arrows,status,alternate sign out"},{"n":"sign-language","s":"accessibility,sign language"},{"n":"sign-in-alt","s":"interfaces,arrows,status,alternate sign in"},{"n":"sign","s":"moving,sign"},{"n":"shower","s":"maps,objects,shower"},{"n":"shopping-cart","s":"maps,objects,payments-shopping,status,vehicles,shopping-cart"},{"n":"shopping-basket","s":"maps,objects,payments-shopping,shopping basket"},{"n":"shopping-bag","s":"maps,objects,payments-shopping,shopping bag"},{"n":"shirtsinbulk fab","s":"shirts in bulk"},{"n":"shipping-fast","s":"logistics,shipping fast"},{"n":"ship","s":"maps,vehicles,ship"},{"n":"shield-alt","s":"code,objects,interfaces,status,alternate shield"},{"n":"shekel-sign","s":"currency,shekel sign"},{"n":"share-square","s":"interfaces,arrows,share square"},{"n":"share-alt-square","s":"interfaces,alternate share square"},{"n":"share-alt","s":"interfaces,alternate share"},{"n":"share","s":"editors,interfaces,arrows,share"},{"n":"servicestack fab","s":"servicestack"},{"n":"server","s":"computers,server"},{"n":"sellsy fab","s":"sellsy"},{"n":"sellcast fab","s":"sellcast"},{"n":"seedling","s":"charity,seedling"},{"n":"searchengin fab","s":"searchengin"},{"n":"search-plus","s":"maps,interfaces,search plus"},{"n":"search-minus","s":"maps,interfaces,search minus"},{"n":"search","s":"maps,objects,interfaces,search"},{"n":"scribd fab","s":"scribd"},{"n":"schlix fab","s":"schlix"},{"n":"save","s":"objects,business,interfaces,design,computers,files,save"},{"n":"sass fab","s":"sass"},{"n":"safari fab","s":"safari"},{"n":"rupee-sign","s":"currency,indian rupee sign"},{"n":"ruble-sign","s":"currency,ruble sign"},{"n":"rss-square","s":"communication,interfaces,audio-video,rss square"},{"n":"rss","s":"communication,interfaces,audio-video,rss"},{"n":"rockrms fab","s":"rockrms"},{"n":"rocketchat fab","s":"rocket.chat"},{"n":"rocket","s":"maps,objects,vehicles,rocket"},{"n":"road","s":"maps,objects,road"},{"n":"ribbon","s":"charity,ribbon"},{"n":"retweet","s":"arrows,retweet"},{"n":"resolving fab","s":"resolving"},{"n":"replyd fab","s":"replyd"},{"n":"reply-all","s":"editors,interfaces,arrows,reply-all"},{"n":"reply","s":"editors,interfaces,arrows,reply"},{"n":"renren fab","s":"renren"},{"n":"rendact fab","s":"rendact"},{"n":"registered","s":"business,registered trademark"},{"n":"redo-alt","s":"editors,interfaces,audio-video,arrows,alternate redo"},{"n":"redo","s":"editors,interfaces,audio-video,arrows,redo"},{"n":"reddit-square fab","s":"reddit square"},{"n":"reddit-alien fab","s":"reddit alien"},{"n":"reddit fab","s":"reddit logo"},{"n":"red-river fab","s":"red river"},{"n":"recycle","s":"maps,arrows,recycle"},{"n":"rebel fab","s":"rebel alliance"},{"n":"readme fab","s":"readme"},{"n":"react fab","s":"react"},{"n":"ravelry fab","s":"ravelry"},{"n":"random","s":"audio-video,arrows,random"},{"n":"quote-right","s":"editors,interfaces,writing,chat,quote-right"},{"n":"quote-left","s":"editors,interfaces,writing,chat,quote-left"},{"n":"quora fab","s":"quora"},{"n":"quinscape fab","s":"quinscape"},{"n":"quidditch","s":"sports,quidditch"},{"n":"question-circle","s":"accessibility,interfaces,status,question circle"},{"n":"question","s":"interfaces,status,question"},{"n":"qrcode","s":"code,interfaces,qrcode"},{"n":"qq fab","s":"qq"},{"n":"python fab","s":"python"},{"n":"puzzle-piece","s":"objects,puzzle piece"},{"n":"pushed fab","s":"pushed"},{"n":"product-hunt fab","s":"product hunt"},{"n":"procedures","s":"medical,procedures"},{"n":"print","s":"maps,objects,editors,computers,print"},{"n":"prescription-bottle-alt","s":"medical,alternate prescription bottle"},{"n":"prescription-bottle","s":"medical,prescription bottle"},{"n":"power-off","s":"computers,users-people,power off"},{"n":"pound-sign","s":"currency,pound sign"},{"n":"poo","s":"interfaces,chat,users-people,poo"},{"n":"podcast","s":"audio-video,podcast"},{"n":"plus-square","s":"maps,health,interfaces,status,plus square"},{"n":"plus-circle","s":"interfaces,status,plus circle"},{"n":"plus","s":"maps,interfaces,status,medical,plus"},{"n":"plug","s":"maps,objects,computers,plug"},{"n":"playstation fab","s":"playstation"},{"n":"play-circle","s":"audio-video,play circle"},{"n":"play","s":"shapes,audio-video,arrows,play"},{"n":"plane","s":"maps,objects,vehicles,plane"},{"n":"pinterest-square fab","s":"pinterest square"},{"n":"pinterest-p fab","s":"pinterest p"},{"n":"pinterest fab","s":"pinterest"},{"n":"pills","s":"medical,pills"},{"n":"piggy-bank","s":"charity,piggy bank"},{"n":"pied-piper-pp fab","s":"pied piper pp logo (old)"},{"n":"pied-piper-hat fab","s":"pied piper-hat"},{"n":"pied-piper-alt fab","s":"alternate pied piper logo"},{"n":"pied-piper fab","s":"pied piper logo"},{"n":"php fab","s":"php"},{"n":"phone-volume","s":"maps,accessibility,business,communication,audio-video,phone volume"},{"n":"phone-square","s":"maps,business,communication,phone square"},{"n":"phone-slash","s":"business,communication,chat,phone slash"},{"n":"phone","s":"maps,objects,business,communication,chat,phone"},{"n":"phoenix-framework fab","s":"phoenix framework"},{"n":"phabricator fab","s":"phabricator"},{"n":"periscope fab","s":"periscope"},{"n":"percent","s":"business,percent"},{"n":"people-carry","s":"moving,people carry"},{"n":"pencil-alt","s":"objects,business,editors,interfaces,writing,design,alternate pencil"},{"n":"pen-square","s":"business,writing,pen square"},{"n":"paypal fab","s":"payments-shopping,paypal"},{"n":"paw","s":"maps,objects,paw"},{"n":"pause-circle","s":"audio-video,pause circle"},{"n":"pause","s":"audio-video,pause"},{"n":"patreon fab","s":"patreon"},{"n":"paste","s":"objects,business,editors,interfaces,design,files,paste"},{"n":"paragraph","s":"editors,writing,paragraph"},{"n":"parachute-box","s":"charity,parachute box"},{"n":"paperclip","s":"objects,business,editors,writing,paperclip"},{"n":"paper-plane","s":"objects,editors,communication,writing,vehicles,paper plane"},{"n":"pallet","s":"logistics,pallet"},{"n":"palfed fab","s":"palfed"},{"n":"paint-brush","s":"objects,design,paint brush"},{"n":"pagelines fab","s":"pagelines"},{"n":"page4 fab","s":"page4 corporation"},{"n":"outdent","s":"editors,outdent"},{"n":"osi fab","s":"open source initiative"},{"n":"optin-monster fab","s":"optin monster"},{"n":"opera fab","s":"opera"},{"n":"openid fab","s":"openid"},{"n":"opencart fab","s":"opencart"},{"n":"odnoklassniki-square fab","s":"odnoklassniki square"},{"n":"odnoklassniki fab","s":"odnoklassniki"},{"n":"object-ungroup","s":"design,object ungroup"},{"n":"object-group","s":"design,object group"},{"n":"nutritionix fab","s":"nutritionix"},{"n":"ns8 fab","s":"ns8"},{"n":"npm fab","s":"npm"},{"n":"notes-medical","s":"medical,medical notes"},{"n":"node-js fab","s":"node.js js"},{"n":"node fab","s":"node.js"},{"n":"nintendo-switch fab","s":"nintendo switch"},{"n":"newspaper","s":"maps,objects,writing,newspaper"},{"n":"neuter","s":"gender,neuter"},{"n":"napster fab","s":"napster"},{"n":"music","s":"maps,audio-video,music"},{"n":"mouse-pointer","s":"arrows,mouse pointer"},{"n":"motorcycle","s":"maps,objects,vehicles,motorcycle"},{"n":"moon","s":"objects,moon"},{"n":"money-bill-alt","s":"maps,objects,currency,money bill alternate"},{"n":"monero fab","s":"monero"},{"n":"modx fab","s":"modx"},{"n":"mobile-alt","s":"objects,communication,computers,alternate mobile"},{"n":"mobile","s":"objects,communication,computers,mobile phone"},{"n":"mizuni fab","s":"mizuni"},{"n":"mixcloud fab","s":"mixcloud"},{"n":"mix fab","s":"mix"},{"n":"minus-square","s":"interfaces,status,minus square"},{"n":"minus-circle","s":"interfaces,status,minus circle"},{"n":"minus","s":"interfaces,status,minus"},{"n":"microsoft fab","s":"microsoft"},{"n":"microphone-slash","s":"communication,interfaces,audio-video,microphone slash"},{"n":"microphone","s":"objects,communication,interfaces,audio-video,microphone"},{"n":"microchip","s":"code,objects,computers,microchip"},{"n":"mercury","s":"gender,mercury"},{"n":"meh","s":"interfaces,chat,users-people,meh"},{"n":"meetup fab","s":"meetup"},{"n":"medrt fab","s":"mrt"},{"n":"medkit","s":"maps,objects,health,medkit"},{"n":"medium-m fab","s":"medium m"},{"n":"medium fab","s":"medium"},{"n":"medapps fab","s":"medapps"},{"n":"maxcdn fab","s":"maxcdn"},{"n":"mars-stroke-v","s":"gender,mars stroke vertical"},{"n":"mars-stroke-h","s":"gender,mars stroke horizontal"},{"n":"mars-stroke","s":"gender,mars stroke"},{"n":"mars-double","s":"gender,mars double"},{"n":"mars","s":"gender,mars"},{"n":"map-signs","s":"maps,objects,map signs"},{"n":"map-pin","s":"maps,objects,map pin"},{"n":"map-marker-alt","s":"maps,objects,map marker alternate"},{"n":"map-marker","s":"maps,objects,shapes,map-marker"},{"n":"map","s":"maps,objects,map"},{"n":"male","s":"maps,users-people,male"},{"n":"magnet","s":"maps,objects,magnet"},{"n":"magic","s":"objects,interfaces,magic"},{"n":"magento fab","s":"magento"},{"n":"lyft fab","s":"lyft"},{"n":"low-vision","s":"maps,accessibility,low vision"},{"n":"long-arrow-alt-up","s":"arrows,alternate long arrow up"},{"n":"long-arrow-alt-right","s":"arrows,alternate long arrow right"},{"n":"long-arrow-alt-left","s":"arrows,alternate long arrow left"},{"n":"long-arrow-alt-down","s":"arrows,alternate long arrow down"},{"n":"lock-open","s":"objects,status,lock open"},{"n":"lock","s":"objects,status,lock"},{"n":"location-arrow","s":"maps,arrows,location-arrow"},{"n":"list-ul","s":"editors,list-ul"},{"n":"list-ol","s":"editors,list-ol"},{"n":"list-alt","s":"editors,list alternate"},{"n":"list","s":"editors,list"},{"n":"lira-sign","s":"currency,turkish lira sign"},{"n":"linux fab","s":"linux"},{"n":"linode fab","s":"linode"},{"n":"linkedin-in fab","s":"linkedin in"},{"n":"linkedin fab","s":"linkedin"},{"n":"link","s":"editors,link"},{"n":"line fab","s":"line"},{"n":"lightbulb","s":"maps,objects,lightbulb"},{"n":"life-ring","s":"maps,objects,spinners,life ring"},{"n":"level-up-alt","s":"arrows,level up alternate"},{"n":"level-down-alt","s":"arrows,level down alternate"},{"n":"less fab","s":"less"},{"n":"lemon","s":"maps,objects,lemon"},{"n":"leanpub fab","s":"leanpub"},{"n":"leaf","s":"maps,objects,charity,leaf"},{"n":"lastfm-square fab","s":"last.fm square"},{"n":"lastfm fab","s":"last.fm"},{"n":"laravel fab","s":"laravel"},{"n":"laptop","s":"objects,computers,laptop"},{"n":"language","s":"communication,interfaces,language"},{"n":"korvue fab","s":"korvue"},{"n":"kickstarter-k fab","s":"kickstarter k"},{"n":"kickstarter fab","s":"kickstarter"},{"n":"keycdn fab","s":"keycdn"},{"n":"keyboard","s":"code,objects,writing,computers,keyboard"},{"n":"key","s":"maps,objects,payments-shopping,key"},{"n":"jsfiddle fab","s":"jsfiddle"},{"n":"js-square fab","s":"javascript (js) square"},{"n":"js fab","s":"javascript (js)"},{"n":"joomla fab","s":"joomla logo"},{"n":"joget fab","s":"joget"},{"n":"jenkins fab","s":"jenkis"},{"n":"java fab","s":"java"},{"n":"itunes-note fab","s":"itunes note"},{"n":"itunes fab","s":"itunes"},{"n":"italic","s":"editors,italic"},{"n":"ioxhost fab","s":"ioxhost"},{"n":"internet-explorer fab","s":"internet-explorer"},{"n":"instagram fab","s":"instagram"},{"n":"info-circle","s":"maps,interfaces,status,info circle"},{"n":"info","s":"maps,interfaces,status,info"},{"n":"industry","s":"maps,objects,business,industry"},{"n":"indent","s":"editors,indent"},{"n":"inbox","s":"communication,inbox"},{"n":"imdb fab","s":"imdb"},{"n":"images","s":"maps,objects,images,images"},{"n":"image","s":"maps,objects,images,image"},{"n":"id-card-alt","s":"medical,identification card alternate"},{"n":"id-card","s":"images,users-people,identification card"},{"n":"id-badge","s":"images,users-people,identification badge"},{"n":"i-cursor","s":"editors,interfaces,i beam cursor"},{"n":"hubspot fab","s":"hubspot"},{"n":"html5 fab","s":"html 5 logo"},{"n":"houzz fab","s":"houzz"},{"n":"hourglass-start","s":"date-time,hourglass start"},{"n":"hourglass-half","s":"date-time,hourglass half"},{"n":"hourglass-end","s":"date-time,hourglass end"},{"n":"hourglass","s":"objects,date-time,hourglass"},{"n":"hotjar fab","s":"hotjar"},{"n":"hospital-symbol","s":"medical,hospital symbol"},{"n":"hospital-alt","s":"medical,hospital alternate"},{"n":"hospital","s":"maps,objects,health,medical,hospital"},{"n":"hooli fab","s":"hooli"},{"n":"home","s":"maps,objects,interfaces,home"},{"n":"hockey-puck","s":"sports,hockey puck"},{"n":"history","s":"interfaces,arrows,history"},{"n":"hire-a-helper fab","s":"hireahelper"},{"n":"hips fab","s":"hips"},{"n":"heartbeat","s":"maps,health,medical,heartbeat"},{"n":"heart","s":"maps,objects,health,payments-shopping,interfaces,shapes,charity,medical,heart"},{"n":"headphones","s":"objects,audio-video,computers,headphones"},{"n":"heading","s":"editors,heading"},{"n":"hdd","s":"objects,computers,hdd"},{"n":"hashtag","s":"interfaces,hashtag"},{"n":"handshake","s":"payments-shopping,hands,charity,handshake"},{"n":"hands-helping","s":"charity,helping hands"},{"n":"hands","s":"hands,hands"},{"n":"hand-spock","s":"hands,spock (hand)"},{"n":"hand-scissors","s":"hands,scissors (hand)"},{"n":"hand-rock","s":"hands,rock (hand)"},{"n":"hand-pointer","s":"hands,arrows,pointer (hand)"},{"n":"hand-point-up","s":"hands,arrows,hand pointing up"},{"n":"hand-point-right","s":"hands,arrows,hand pointing right"},{"n":"hand-point-left","s":"hands,arrows,hand pointing left"},{"n":"hand-point-down","s":"hands,arrows,hand pointing down"},{"n":"hand-peace","s":"hands,peace (hand)"},{"n":"hand-paper","s":"hands,paper (hand)"},{"n":"hand-lizard","s":"hands,lizard (hand)"},{"n":"hand-holding-usd","s":"charity,hand holding us dollar"},{"n":"hand-holding-heart","s":"charity,hand holding heart"},{"n":"hand-holding","s":"hands,hand holding"},{"n":"hacker-news-square fab","s":"hacker news square"},{"n":"hacker-news fab","s":"hacker news"},{"n":"h-square","s":"maps,health,h square"},{"n":"gulp fab","s":"gulp"},{"n":"grunt fab","s":"grunt"},{"n":"gripfire fab","s":"gripfire, inc."},{"n":"grav fab","s":"grav"},{"n":"gratipay fab","s":"gratipay (gittip)"},{"n":"graduation-cap","s":"maps,objects,graduation cap"},{"n":"google-wallet fab","s":"payments-shopping,google wallet"},{"n":"google-plus-square fab","s":"google plus square"},{"n":"google-plus-g fab","s":"google plus g"},{"n":"google-plus fab","s":"google plus"},{"n":"google-play fab","s":"google play"},{"n":"google-drive fab","s":"google drive"},{"n":"google fab","s":"google logo"},{"n":"goodreads-g fab","s":"goodreads g"},{"n":"goodreads fab","s":"goodreads"},{"n":"golf-ball","s":"sports,golf ball"},{"n":"gofore fab","s":"gofore"},{"n":"globe","s":"maps,objects,business,charity,globe"},{"n":"glide-g fab","s":"glide g"},{"n":"glide fab","s":"glide"},{"n":"glass-martini","s":"maps,objects,martini glass"},{"n":"gitter fab","s":"gitter"},{"n":"gitlab fab","s":"gitlab"},{"n":"gitkraken fab","s":"gitkraken"},{"n":"github-square fab","s":"github square"},{"n":"github-alt fab","s":"alternate github"},{"n":"github fab","s":"github"},{"n":"git-square fab","s":"git square"},{"n":"git fab","s":"git"},{"n":"gift","s":"maps,objects,payments-shopping,charity,gift"},{"n":"gg-circle fab","s":"currency,gg currency circle"},{"n":"gg fab","s":"currency,gg currency"},{"n":"get-pocket fab","s":"get pocket"},{"n":"genderless","s":"gender,genderless"},{"n":"gem","s":"objects,payments-shopping,gem"},{"n":"gavel","s":"maps,objects,gavel"},{"n":"gamepad","s":"maps,objects,gamepad"},{"n":"futbol","s":"objects,sports,futbol"},{"n":"frown","s":"interfaces,chat,users-people,frown"},{"n":"freebsd fab","s":"freebsd"},{"n":"free-code-camp fab","s":"free code camp"},{"n":"foursquare fab","s":"foursquare"},{"n":"forward","s":"audio-video,forward"},{"n":"forumbee fab","s":"forumbee"},{"n":"fort-awesome-alt fab","s":"alternate fort awesome"},{"n":"fort-awesome fab","s":"fort awesome"},{"n":"football-ball","s":"sports,football ball"},{"n":"fonticons-fi fab","s":"fonticons fi"},{"n":"fonticons fab","s":"fonticons"},{"n":"font-awesome-flag fab","s":"font awesome flag"},{"n":"font-awesome-alt fab","s":"alternate font awesome"},{"n":"font-awesome fab","s":"font awesome"},{"n":"font","s":"editors,font"},{"n":"folder-open","s":"code,business,interfaces,writing,status,files,folder open"},{"n":"folder","s":"code,business,interfaces,writing,shapes,status,files,folder"},{"n":"fly fab","s":"fly"},{"n":"flipboard fab","s":"flipboard"},{"n":"flickr fab","s":"flickr"},{"n":"flask","s":"maps,objects,flask"},{"n":"flag-checkered","s":"maps,objects,interfaces,flag-checkered"},{"n":"flag","s":"maps,objects,interfaces,flag"},{"n":"firstdraft fab","s":"firstdraft"},{"n":"first-order fab","s":"first order"},{"n":"first-aid","s":"medical,first aid"},{"n":"firefox fab","s":"firefox"},{"n":"fire-extinguisher","s":"code,maps,objects,fire-extinguisher"},{"n":"fire","s":"maps,objects,fire"},{"n":"filter","s":"code,interfaces,filter"},{"n":"film","s":"objects,audio-video,images,film"},{"n":"file-word","s":"files,word file"},{"n":"file-video","s":"audio-video,files,video file"},{"n":"file-powerpoint","s":"files,powerpoint file"},{"n":"file-pdf","s":"files,pdf file"},{"n":"file-medical-alt","s":"medical,medical file alternate"},{"n":"file-medical","s":"medical,medical file"},{"n":"file-image","s":"images,files,image file"},{"n":"file-excel","s":"files,excel file"},{"n":"file-code","s":"code,files,code file"},{"n":"file-audio","s":"audio-video,files,audio file"},{"n":"file-archive","s":"files,archive file"},{"n":"file-alt","s":"code,objects,business,editors,interfaces,writing,status,files,alternate file"},{"n":"file","s":"code,objects,business,editors,interfaces,writing,shapes,status,files,file"},{"n":"fighter-jet","s":"maps,objects,vehicles,fighter-jet"},{"n":"female","s":"users-people,female"},{"n":"fax","s":"objects,business,communication,fax"},{"n":"fast-forward","s":"audio-video,fast-forward"},{"n":"fast-backward","s":"audio-video,fast-backward"},{"n":"facebook-square fab","s":"facebook square"},{"n":"facebook-messenger fab","s":"facebook messenger"},{"n":"facebook-f fab","s":"facebook f"},{"n":"facebook fab","s":"facebook"},{"n":"eye-slash","s":"maps,interfaces,design,status,images,eye slash"},{"n":"eye-dropper","s":"objects,design,images,eye dropper"},{"n":"eye","s":"maps,objects,interfaces,design,status,images,eye"},{"n":"external-link-square-alt","s":"interfaces,arrows,alternate external link square"},{"n":"external-link-alt","s":"interfaces,arrows,alternate external link"},{"n":"expeditedssl fab","s":"expeditedssl"},{"n":"expand-arrows-alt","s":"audio-video,arrows,alternate expand arrows"},{"n":"expand","s":"audio-video,images,expand"},{"n":"exclamation-triangle","s":"interfaces,status,exclamation triangle"},{"n":"exclamation-circle","s":"interfaces,status,exclamation circle"},{"n":"exclamation","s":"interfaces,status,exclamation"},{"n":"exchange-alt","s":"arrows,alternate exchange"},{"n":"euro-sign","s":"currency,euro sign"},{"n":"etsy fab","s":"etsy"},{"n":"ethereum fab","s":"payments-shopping,ethereum"},{"n":"erlang fab","s":"erlang"},{"n":"eraser","s":"objects,business,editors,interfaces,writing,design,eraser"},{"n":"envira fab","s":"envira gallery"},{"n":"envelope-square","s":"business,communication,envelope square"},{"n":"envelope-open","s":"objects,business,communication,interfaces,writing,envelope open"},{"n":"envelope","s":"objects,business,communication,interfaces,writing,envelope"},{"n":"empire fab","s":"galactic empire"},{"n":"ember fab","s":"ember"},{"n":"ellipsis-v","s":"interfaces,vertical ellipsis"},{"n":"ellipsis-h","s":"interfaces,horizontal ellipsis"},{"n":"elementor fab","s":"elementor"},{"n":"eject","s":"audio-video,eject"},{"n":"edit","s":"business,editors,interfaces,writing,design,edit"},{"n":"edge fab","s":"edge browser"},{"n":"earlybirds fab","s":"earlybirds"},{"n":"dyalog fab","s":"dyalog"},{"n":"drupal fab","s":"drupal logo"},{"n":"dropbox fab","s":"dropbox"},{"n":"dribbble-square fab","s":"dribbble square"},{"n":"dribbble fab","s":"dribbble"},{"n":"draft2digital fab","s":"draft2digital"},{"n":"download","s":"interfaces,arrows,computers,download"},{"n":"dove","s":"charity,dove"},{"n":"dot-circle","s":"interfaces,dot circle"},{"n":"donate","s":"charity,donate"},{"n":"dolly-flatbed","s":"logistics,dolly flatbed"},{"n":"dolly","s":"moving,logistics,dolly"},{"n":"dollar-sign","s":"maps,currency,charity,dollar sign"},{"n":"docker fab","s":"docker"},{"n":"dochub fab","s":"dochub"},{"n":"dna","s":"medical,dna"},{"n":"discourse fab","s":"discourse"},{"n":"discord fab","s":"discord"},{"n":"digital-ocean fab","s":"digital ocean"},{"n":"digg fab","s":"digg logo"},{"n":"diagnoses","s":"medical,diagnoses"},{"n":"deviantart fab","s":"deviantart"},{"n":"desktop","s":"computers,desktop"},{"n":"deskpro fab","s":"deskpro"},{"n":"deploydog fab","s":"deploy.dog"},{"n":"delicious fab","s":"delicious logo"},{"n":"deaf","s":"accessibility,deaf"},{"n":"database","s":"interfaces,computers,database"},{"n":"dashcube fab","s":"dashcube"},{"n":"d-and-d fab","s":"dungeons & dragons"},{"n":"cuttlefish fab","s":"cuttlefish"},{"n":"cut","s":"objects,business,editors,interfaces,design,files,cut"},{"n":"cubes","s":"objects,cubes"},{"n":"cube","s":"objects,cube"},{"n":"css3-alt fab","s":"alternate css3 logo"},{"n":"css3 fab","s":"css 3 logo"},{"n":"crosshairs","s":"maps,spinners,design,crosshairs"},{"n":"crop","s":"design,crop"},{"n":"credit-card","s":"payments-shopping,credit card"},{"n":"creative-commons fab","s":"creative commons"},{"n":"cpanel fab","s":"cpanel"},{"n":"couch","s":"moving,couch"},{"n":"copyright","s":"business,copyright"},{"n":"copy","s":"objects,business,editors,interfaces,design,files,copy"},{"n":"contao fab","s":"contao"},{"n":"connectdevelop fab","s":"connect develop"},{"n":"compress","s":"audio-video,images,compress"},{"n":"compass","s":"objects,business,spinners,compass"},{"n":"comments","s":"communication,chat,comments"},{"n":"comment-slash","s":"chat,comment slash"},{"n":"comment-dots","s":"chat,comment dots"},{"n":"comment-alt","s":"communication,chat,alternate comment"},{"n":"comment","s":"communication,shapes,chat,comment"},{"n":"columns","s":"business,editors,columns"},{"n":"cogs","s":"objects,interfaces,cogs"},{"n":"cog","s":"objects,interfaces,spinners,cog"},{"n":"coffee","s":"code,maps,objects,business,interfaces,coffee"},{"n":"codiepie fab","s":"codie pie"},{"n":"codepen fab","s":"codepen"},{"n":"code-branch","s":"code,code branch"},{"n":"code","s":"code,code"},{"n":"cloudversify fab","s":"cloudversify"},{"n":"cloudsmith fab","s":"cloudsmith"},{"n":"cloudscale fab","s":"cloudscale.ch"},{"n":"cloud-upload-alt","s":"interfaces,arrows,cloud upload alternate"},{"n":"cloud-download-alt","s":"interfaces,arrows,cloud download alternate"},{"n":"cloud","s":"objects,interfaces,shapes,cloud"},{"n":"closed-captioning","s":"accessibility,audio-video,closed captioning"},{"n":"clone","s":"editors,interfaces,design,images,files,clone"},{"n":"clock","s":"date-time,clock"},{"n":"clipboard-list","s":"logistics,clipboard list"},{"n":"clipboard-check","s":"logistics,clipboard check"},{"n":"clipboard","s":"objects,business,editors,interfaces,clipboard"},{"n":"circle-notch","s":"spinners,circle notched"},{"n":"circle","s":"interfaces,shapes,audio-video,circle"},{"n":"chrome fab","s":"chrome"},{"n":"child","s":"users-people,child"},{"n":"chevron-up","s":"arrows,chevron-up"},{"n":"chevron-right","s":"arrows,chevron-right"},{"n":"chevron-left","s":"arrows,chevron-left"},{"n":"chevron-down","s":"arrows,chevron-down"},{"n":"chevron-circle-up","s":"arrows,chevron circle up"},{"n":"chevron-circle-right","s":"arrows,chevron circle right"},{"n":"chevron-circle-left","s":"arrows,chevron circle left"},{"n":"chevron-circle-down","s":"arrows,chevron circle down"},{"n":"chess-rook","s":"chess,chess rook"},{"n":"chess-queen","s":"chess,chess queen"},{"n":"chess-pawn","s":"chess,chess pawn"},{"n":"chess-knight","s":"chess,chess knight"},{"n":"chess-king","s":"chess,chess king"},{"n":"chess-board","s":"chess,chess board"},{"n":"chess-bishop","s":"chess,chess bishop"},{"n":"chess","s":"chess,chess"},{"n":"check-square","s":"interfaces,check square"},{"n":"check-circle","s":"interfaces,check circle"},{"n":"check","s":"interfaces,check"},{"n":"chart-pie","s":"business,pie chart"},{"n":"chart-line","s":"business,arrows,line chart"},{"n":"chart-bar","s":"business,bar chart"},{"n":"chart-area","s":"business,area chart"},{"n":"certificate","s":"business,payments-shopping,interfaces,shapes,spinners,certificate"},{"n":"centercode fab","s":"centercode"},{"n":"cc-visa fab","s":"payments-shopping,visa credit card"},{"n":"cc-stripe fab","s":"payments-shopping,stripe credit card"},{"n":"cc-paypal fab","s":"payments-shopping,paypal credit card"},{"n":"cc-mastercard fab","s":"payments-shopping,mastercard credit card"},{"n":"cc-jcb fab","s":"payments-shopping,jcb credit card"},{"n":"cc-discover fab","s":"payments-shopping,discover credit card"},{"n":"cc-diners-club fab","s":"payments-shopping,diner's club credit card"},{"n":"cc-apple-pay fab","s":"payments-shopping,apple pay credit card"},{"n":"cc-amex fab","s":"payments-shopping,american express credit card"},{"n":"cc-amazon-pay fab","s":"payments-shopping,amazon pay credit card"},{"n":"cart-plus","s":"payments-shopping,status,add to shopping cart"},{"n":"cart-arrow-down","s":"payments-shopping,arrows,status,shopping cart arrow down"},{"n":"caret-up","s":"arrows,caret up"},{"n":"caret-square-up","s":"arrows,caret square up"},{"n":"caret-square-right","s":"arrows,caret square right"},{"n":"caret-square-left","s":"arrows,caret square left"},{"n":"caret-square-down","s":"arrows,caret square down"},{"n":"caret-right","s":"arrows,caret right"},{"n":"caret-left","s":"arrows,caret left"},{"n":"caret-down","s":"arrows,caret down"},{"n":"car","s":"maps,objects,vehicles,car"},{"n":"capsules","s":"medical,capsules"},{"n":"camera-retro","s":"objects,payments-shopping,images,retro camera"},{"n":"camera","s":"objects,payments-shopping,images,camera"},{"n":"calendar-times","s":"date-time,interfaces,status,calendar times"},{"n":"calendar-plus","s":"date-time,interfaces,status,calendar plus"},{"n":"calendar-minus","s":"date-time,interfaces,status,calendar minus"},{"n":"calendar-check","s":"date-time,interfaces,status,calendar check"},{"n":"calendar-alt","s":"objects,date-time,business,interfaces,status,alternate calendar"},{"n":"calendar","s":"objects,date-time,business,interfaces,shapes,status,calendar"},{"n":"calculator","s":"objects,business,interfaces,calculator"},{"n":"buysellads fab","s":"buysellads"},{"n":"bus","s":"objects,vehicles,bus"},{"n":"buromobelexperte fab","s":"büromöbel-experte gmbh & co. kg."},{"n":"burn","s":"medical,burn"},{"n":"bullseye","s":"objects,business,interfaces,bullseye"},{"n":"bullhorn","s":"objects,business,payments-shopping,communication,interfaces,bullhorn"},{"n":"building","s":"maps,objects,business,building"},{"n":"bug","s":"code,objects,interfaces,bug"},{"n":"btc fab","s":"currency,btc"},{"n":"briefcase-medical","s":"medical,medical briefcase"},{"n":"briefcase","s":"maps,objects,business,briefcase"},{"n":"braille","s":"accessibility,braille"},{"n":"boxes","s":"logistics,boxes"},{"n":"box-open","s":"moving,box open"},{"n":"box","s":"logistics,box"},{"n":"bowling-ball","s":"sports,bowling ball"},{"n":"bookmark","s":"maps,objects,payments-shopping,writing,shapes,bookmark"},{"n":"book","s":"maps,objects,business,writing,book"},{"n":"bomb","s":"maps,objects,bomb"},{"n":"bolt","s":"images,lightning bolt"},{"n":"bold","s":"editors,bold"},{"n":"bluetooth-b fab","s":"communication,bluetooth"},{"n":"bluetooth fab","s":"communication,bluetooth"},{"n":"blogger-b fab","s":"blogger b"},{"n":"blogger fab","s":"blogger"},{"n":"blind","s":"maps,accessibility,users-people,blind"},{"n":"blackberry fab","s":"blackberry"},{"n":"black-tie fab","s":"font awesome black tie"},{"n":"bity fab","s":"bity"},{"n":"bitcoin fab","s":"currency,bitcoin"},{"n":"bitbucket fab","s":"bitbucket"},{"n":"birthday-cake","s":"maps,objects,business,birthday cake"},{"n":"binoculars","s":"maps,objects,binoculars"},{"n":"bimobject fab","s":"bimobject"},{"n":"bicycle","s":"maps,objects,vehicles,bicycle"},{"n":"bell-slash","s":"maps,date-time,communication,interfaces,status,bell slash"},{"n":"bell","s":"maps,objects,date-time,payments-shopping,communication,interfaces,status,bell"},{"n":"behance-square fab","s":"behance square"},{"n":"behance fab","s":"behance"},{"n":"beer","s":"maps,objects,interfaces,beer"},{"n":"bed","s":"maps,objects,users-people,bed"},{"n":"battery-three-quarters","s":"status,battery 3/4 full"},{"n":"battery-quarter","s":"status,battery 1/4 full"},{"n":"battery-half","s":"status,battery 1/2 full"},{"n":"battery-full","s":"status,battery full"},{"n":"battery-empty","s":"status,battery empty"},{"n":"bath","s":"code,maps,objects,bath"},{"n":"basketball-ball","s":"sports,basketball ball"},{"n":"baseball-ball","s":"sports,baseball ball"},{"n":"bars","s":"interfaces,bars"},{"n":"barcode","s":"code,interfaces,barcode"},{"n":"bandcamp fab","s":"bandcamp"},{"n":"band-aid","s":"medical,band-aid"},{"n":"ban","s":"interfaces,status,ban"},{"n":"balance-scale","s":"maps,objects,business,balance scale"},{"n":"backward","s":"audio-video,backward"},{"n":"aws fab","s":"amazon web services (aws)"},{"n":"aviato fab","s":"aviato"},{"n":"avianex fab","s":"avianex"},{"n":"autoprefixer fab","s":"autoprefixer"},{"n":"audio-description","s":"accessibility,audio-video,audio description"},{"n":"audible fab","s":"audible"},{"n":"at","s":"communication,at"},{"n":"asymmetrik fab","s":"asymmetrik, ltd."},{"n":"asterisk","s":"spinners,asterisk"},{"n":"assistive-listening-systems","s":"accessibility,communication,assistive listening systems"},{"n":"arrows-alt-v","s":"arrows,alternate arrows vertical"},{"n":"arrows-alt-h","s":"arrows,alternate arrows horizontal"},{"n":"arrows-alt","s":"arrows,alternate arrows"},{"n":"arrow-up","s":"arrows,arrow-up"},{"n":"arrow-right","s":"arrows,arrow-right"},{"n":"arrow-left","s":"arrows,arrow-left"},{"n":"arrow-down","s":"arrows,arrow-down"},{"n":"arrow-circle-up","s":"arrows,arrow circle up"},{"n":"arrow-circle-right","s":"arrows,arrow circle right"},{"n":"arrow-circle-left","s":"arrows,arrow circle left"},{"n":"arrow-circle-down","s":"arrows,arrow circle down"},{"n":"arrow-alt-circle-up","s":"arrows,alternate arrow circle up"},{"n":"arrow-alt-circle-right","s":"arrows,alternate arrow circle right"},{"n":"arrow-alt-circle-left","s":"arrows,alternate arrow circle left"},{"n":"arrow-alt-circle-down","s":"arrows,alternate arrow circle down"},{"n":"archive","s":"code,objects,business,moving,writing,files,archive"},{"n":"apple-pay fab","s":"payments-shopping,apple pay"},{"n":"apple fab","s":"apple"},{"n":"apper fab","s":"apper systems ab"},{"n":"app-store-ios fab","s":"ios app store"},{"n":"app-store fab","s":"app store"},{"n":"angular fab","s":"angular"},{"n":"angrycreative fab","s":"angry creative"},{"n":"angle-up","s":"arrows,angle-up"},{"n":"angle-right","s":"arrows,angle-right"},{"n":"angle-left","s":"arrows,angle-left"},{"n":"angle-down","s":"arrows,angle-down"},{"n":"angle-double-up","s":"arrows,angle double up"},{"n":"angle-double-right","s":"arrows,angle double right"},{"n":"angle-double-left","s":"arrows,angle double left"},{"n":"angle-double-down","s":"arrows,angle double down"},{"n":"angellist fab","s":"angellist"},{"n":"android fab","s":"android"},{"n":"anchor","s":"maps,objects,anchor"},{"n":"amilia fab","s":"amilia"},{"n":"american-sign-language-interpreting","s":"accessibility,communication,american sign language interpreting"},{"n":"ambulance","s":"maps,objects,health,vehicles,medical,ambulance"},{"n":"amazon-pay fab","s":"payments-shopping,amazon pay"},{"n":"amazon fab","s":"amazon"},{"n":"allergies","s":"hands,medical,allergies"},{"n":"align-right","s":"editors,align-right"},{"n":"align-left","s":"editors,align-left"},{"n":"align-justify","s":"editors,align-justify"},{"n":"align-center","s":"editors,align-center"},{"n":"algolia fab","s":"algolia"},{"n":"affiliatetheme fab","s":"affiliatetheme"},{"n":"adversal fab","s":"adversal"},{"n":"adn fab","s":"app.net"},{"n":"adjust","s":"design,images,adjust"},{"n":"address-card","s":"business,communication,users-people,address card"},{"n":"address-book","s":"business,communication,users-people,address book"},{"n":"accusoft fab","s":"accusoft"},{"n":"accessible-icon fab","s":"accessibility,health,vehicles,users-people,accessible icon"},{"n":"500px fab","s":"500px"}
];